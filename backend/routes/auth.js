const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { sendOTP, generateOTP } = require("../services/email");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, role, voter_id, wallet_address } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ error: "email, password, role are required" });
    }
    if (role === "VOTER" && !voter_id) {
      return res.status(400).json({ error: "voter_id is required for voter accounts" });
    }

    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Eligibility gate — email + voter_id must BOTH match an admin-uploaded row
    if (role === "VOTER") {
      const [eligible] = await pool.query(
        "SELECT id FROM voter_rolls WHERE email = ? AND voter_id = ? LIMIT 1",
        [email, voter_id]
      );
      if (!eligible.length) {
        return res.status(403).json({
          error: "You are not on the eligible voter list. Your email and voter ID must exactly match the record given to you by the election admin."
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (role, email, password_hash, voter_id, wallet_address, phone_verified) VALUES (?, ?, ?, ?, ?, FALSE)",
      [role, email, passwordHash, voter_id || null, wallet_address || null]
    );

    // ADMIN and CANDIDATE skip OTP — auto verified
    if (role === "ADMIN" || role === "CANDIDATE") {
      await pool.query(
        "UPDATE users SET phone_verified = TRUE WHERE id = ?",
        [result.insertId]
      );
      return res.status(201).json({
        userId: result.insertId,
        message: role === "ADMIN"
          ? "Admin account created. You can log in immediately."
          : "Candidate account created. You can log in immediately."
      });
    }

    // VOTER only — send signup OTP (proves email ownership, one time)
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      "INSERT INTO otp_verifications (user_id, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?)",
      [result.insertId, otp, "PHONE_VERIFY", expiresAt]
    );

    let emailSent = true;
    try {
      await sendOTP(email, otp);
      console.log(`📧 Signup OTP sent to ${email}`);
    } catch (emailErr) {
      emailSent = false;
      console.log(`⚠️  Email sending failed: ${emailErr.message}`);
      console.log(`🔑 Signup OTP for ${email}: ${otp}`);
    }

    res.status(201).json({
      userId: result.insertId,
      message: "Account created. Check your email for the OTP verification code.",
      devOtp: !emailSent ? otp : undefined
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Email already registered" });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "email and otp are required" });
    }

    const [rows] = await pool.query(
      `SELECT ov.* FROM otp_verifications ov
       JOIN users u ON u.id = ov.user_id
       WHERE u.email = ? AND ov.otp_code = ? AND ov.purpose = 'PHONE_VERIFY'
         AND ov.used = FALSE
       ORDER BY ov.created_at DESC LIMIT 1`,
      [email, otp]
    );

    if (!rows.length || new Date(rows[0].expires_at) < new Date()) {
      return res.status(400).json({
        error: "Invalid or expired OTP. Please request a new one."
      });
    }

    await pool.query("UPDATE otp_verifications SET used = TRUE WHERE id = ?", [rows[0].id]);
    await pool.query("UPDATE users SET phone_verified = TRUE WHERE email = ?", [email]);

    console.log(`✅ Email verified for ${email}`);
    res.json({ ok: true, message: "Email verified successfully. You can now log in." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    const [userRows] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (!userRows.length) {
      return res.status(404).json({ error: "No account found for that email" });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      "INSERT INTO otp_verifications (user_id, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?)",
      [userRows[0].id, otp, "PHONE_VERIFY", expiresAt]
    );

    try {
      await sendOTP(email, otp);
    } catch (emailErr) {
      console.log(`🔑 OTP for ${email}: ${otp}`);
    }

    res.json({ ok: true, message: "New OTP sent to your email." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!rows.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.phone_verified) {
      return res.status(403).json({
        error: "Email not verified. Please check your email for the OTP code.",
        needsVerification: true,
        email: user.email
      });
    }

    // NEW: VOTER accounts require a fresh OTP on every login (2FA).
    // ADMIN and CANDIDATE log in directly, unchanged.
    if (user.role === "VOTER") {
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await pool.query(
        "INSERT INTO otp_verifications (user_id, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?)",
        [user.id, otp, "LOGIN_2FA", expiresAt]
      );

      let emailSent = true;
      try {
        await sendOTP(email, otp);
        console.log(`📧 Login OTP sent to ${email}`);
      } catch (emailErr) {
        emailSent = false;
        console.log(`⚠️  Email sending failed: ${emailErr.message}`);
        console.log(`🔑 Login OTP for ${email}: ${otp}`);
      }

      return res.json({
        needsLoginOtp: true,
        email: user.email,
        message: "Enter the OTP sent to your email to complete login.",
        devOtp: !emailSent ? otp : undefined
      });
    }

    // ADMIN / CANDIDATE — issue token immediately, no OTP
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    const displayName = user.email ? user.email.split('@')[0] : `User #${user.id}`;
    res.json({
      token,
      role: user.role,
      email: user.email,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        full_name: displayName,
        voter_id: user.voter_id
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NEW: second step of voter login — verify OTP, then issue token
router.post("/verify-login-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "email and otp are required" });
    }

    const [rows] = await pool.query(
      `SELECT ov.*, u.id as user_id, u.role, u.email as user_email
       FROM otp_verifications ov
       JOIN users u ON u.id = ov.user_id
       WHERE u.email = ? AND ov.otp_code = ? AND ov.purpose = 'LOGIN_2FA'
         AND ov.used = FALSE
       ORDER BY ov.created_at DESC LIMIT 1`,
      [email, otp]
    );

    if (!rows.length) {
      return res.status(400).json({
        error: "Invalid or expired OTP. Please try logging in again."
      });
    }

    await pool.query("UPDATE otp_verifications SET used = TRUE WHERE id = ?", [rows[0].id]);

    const token = jwt.sign(
      { userId: rows[0].user_id, role: rows[0].role, email: rows[0].user_email },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    const userEmail = rows[0].user_email;
    const displayName = userEmail ? userEmail.split('@')[0] : `User #${rows[0].user_id}`;

    console.log(`✅ Login OTP verified for ${email}`);
    res.json({
      token,
      role: rows[0].role,
      email: userEmail,
      user: {
        id: rows[0].user_id,
        role: rows[0].role,
        email: userEmail,
        full_name: displayName
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { requireAuth } = require("../middleware/auth");

router.get("/me", requireAuth(["ADMIN", "CANDIDATE", "VOTER"]), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, role, email, voter_id, phone_verified, created_at FROM users WHERE id = ?",
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    const u = rows[0];
    const displayName = u.email ? u.email.split('@')[0] : `User #${u.id}`;
    res.json({
      id: u.id,
      role: u.role,
      email: u.email,
      voter_id: u.voter_id,
      full_name: displayName,
      phone_verified: u.phone_verified
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VOTER PORTAL AUTHENTICATION & OTP (Step 1 of Voter Tab)
// ─────────────────────────────────────────────────────────────────────────────

const PRELOADED_WHITELIST = [
  { voterId: 'VTR-1001', email: 'alice@tri-vote.dev' },
  { voterId: 'VTR-1002', email: 'bob@tri-vote.dev' },
  { voterId: 'VTR-1003', email: 'charlie@tri-vote.dev' },
];

router.post("/voter/request-otp", async (req, res) => {
  try {
    const { voterId, email, electionId } = req.body;
    if (!voterId || !email) {
      return res.status(400).json({ error: "Both Voter ID and Email are required." });
    }

    const cleanVoterId = String(voterId).trim().toUpperCase();
    const cleanEmail = String(email).trim().toLowerCase();

    // 1. Authenticate voter eligibility strictly against the official voter whitelist uploaded by the admin
    let rolls = [];
    const targetElectionId = electionId ? Number(electionId) : null;

    if (targetElectionId) {
      // Check exact match of BOTH voter_id and email for the specified election
      const [exactMatch] = await pool.query(
        "SELECT id, full_name, email, voter_id, election_id FROM voter_rolls WHERE UPPER(voter_id) = ? AND LOWER(email) = ? AND election_id = ? LIMIT 1",
        [cleanVoterId, cleanEmail, targetElectionId]
      );
      rolls = exactMatch || [];

      if (!rolls.length) {
        // Detailed security warnings based on why it didn't match:
        // Case A: Pair exists in a different election
        const [otherElection] = await pool.query(
          "SELECT id, election_id FROM voter_rolls WHERE UPPER(voter_id) = ? AND LOWER(email) = ? LIMIT 1",
          [cleanVoterId, cleanEmail]
        );
        if (otherElection && otherElection.length > 0) {
          return res.status(403).json({
            error: `Your credentials (Voter ID: ${cleanVoterId}, Email: ${cleanEmail}) are registered for Election #${otherElection[0].election_id}, not Election #${targetElectionId}. Please select Election #${otherElection[0].election_id}.`
          });
        }

        // Case B: Voter ID exists in this election, but with a different email
        const [idMismatch] = await pool.query(
          "SELECT id, email FROM voter_rolls WHERE UPPER(voter_id) = ? AND election_id = ? LIMIT 1",
          [cleanVoterId, targetElectionId]
        );
        if (idMismatch && idMismatch.length > 0) {
          return res.status(403).json({
            error: `The entered email (${cleanEmail}) does not match the official email registered for Voter ID ${cleanVoterId} in Election #${targetElectionId}. Please use your exact registered email.`
          });
        }

        // Case C: Email exists in this election, but with a different voter ID
        const [emailMismatch] = await pool.query(
          "SELECT id, voter_id FROM voter_rolls WHERE LOWER(email) = ? AND election_id = ? LIMIT 1",
          [cleanEmail, targetElectionId]
        );
        if (emailMismatch && emailMismatch.length > 0) {
          return res.status(403).json({
            error: `The entered Voter ID (${cleanVoterId}) does not match the registered Voter ID for email ${cleanEmail} in Election #${targetElectionId}. Please use your exact assigned Voter ID.`
          });
        }

        // Case D: Neither exists in this election roll
        return res.status(403).json({
          error: `Access Denied: The entered Voter ID (${cleanVoterId}) and Email (${cleanEmail}) are not present in the official voter list uploaded by the administrator for Election #${targetElectionId}. The OTP cannot be dispatched.`
        });
      }
    } else {
      // No electionId specified: check exact match across any uploaded election roll
      const [anyMatch] = await pool.query(
        "SELECT id, full_name, email, voter_id, election_id FROM voter_rolls WHERE UPPER(voter_id) = ? AND LOWER(email) = ? ORDER BY id DESC LIMIT 1",
        [cleanVoterId, cleanEmail]
      );
      rolls = anyMatch || [];

      if (!rolls.length) {
        return res.status(403).json({
          error: `Access Denied: The entered Voter ID (${cleanVoterId}) and Email (${cleanEmail}) do not match any eligible voter in the official voter list uploaded by the administrator. The OTP cannot be dispatched.`
        });
      }
    }

    const matchedRoll = rolls[0];
    const voterFullName = matchedRoll.full_name || "Registered Voter";

    // 2. Ensure a user row exists
    let userId = null;
    try {
      const [existingUsers] = await pool.query(
        "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
        [cleanEmail]
      );
      if (existingUsers && existingUsers.length > 0) {
        userId = existingUsers[0].id;
        await pool.query(
          "UPDATE users SET voter_id = ? WHERE id = ? AND (voter_id IS NULL OR voter_id = '')",
          [cleanVoterId, userId]
        );
      } else {
        const [insResult] = await pool.query(
          "INSERT INTO users (role, email, password_hash, voter_id, phone_verified) VALUES ('VOTER', ?, 'NOPASS', ?, 1)",
          [cleanEmail, cleanVoterId]
        );
        userId = insResult.insertId;
      }
    } catch (err) {
      console.warn("User record creation note:", err.message);
    }

    // 3. Generate 6-digit OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      await pool.query(
        "UPDATE otp_verifications SET used = 1 WHERE (email = ? OR user_id = ?) AND purpose = 'VOTER_PORTAL_OTP'",
        [cleanEmail, userId]
      );
    } catch (e) {}

    await pool.query(
      "INSERT INTO otp_verifications (user_id, email, otp_code, purpose, expires_at) VALUES (?, ?, ?, 'VOTER_PORTAL_OTP', ?)",
      [userId, cleanEmail, otp, expiresAt]
    );

    // 4. Send OTP to voter's email
    let emailSent = false;
    let sendError = null;
    try {
      await sendOTP(cleanEmail, otp);
      emailSent = true;
      console.log(`📧 Voter OTP sent to ${cleanEmail}`);
    } catch (emailErr) {
      emailSent = false;
      sendError = emailErr;
      console.warn(`⚠️ Voter OTP email sending failed for ${cleanEmail}: ${emailErr.message}`);
      console.log(`🔑 Fallback Voter OTP for ${cleanEmail}: ${otp}`);
    }

    res.json({
      ok: true,
      message: emailSent
        ? `A 6-digit verification passcode has been sent to ${cleanEmail}.`
        : `Verification code generated for ${cleanEmail}.${!emailSent ? " (SMTP notice: " + (sendError ? sendError.message : "unconfigured") + ")" : ""}`,
      emailSent,
      emailError: !emailSent && sendError ? sendError.message : undefined,
      devOtp: !emailSent ? otp : undefined
    });
  } catch (err) {
    console.error("voter request-otp error:", err);
    res.status(500).json({ error: err.message || "Failed to process voter authentication request." });
  }
});

router.post("/voter/verify-otp", async (req, res) => {
  try {
    const { voterId, email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP passcode are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();
    const cleanVoterId = voterId ? String(voterId).trim().toUpperCase() : "";

    const [rows] = await pool.query(
      `SELECT ov.*, u.id as user_id, u.role, u.email as user_email, u.voter_id as user_voter_id
       FROM otp_verifications ov
       LEFT JOIN users u ON u.id = ov.user_id
       WHERE (LOWER(ov.email) = ? OR LOWER(u.email) = ?)
         AND ov.otp_code = ?
         AND ov.purpose = 'VOTER_PORTAL_OTP'
         AND ov.used = 0
       ORDER BY ov.created_at DESC LIMIT 1`,
      [cleanEmail, cleanEmail, cleanOtp]
    );

    if (!rows.length) {
      return res.status(400).json({
        error: "Invalid or expired OTP. Please enter the passcode sent to your email."
      });
    }

    const verificationRecord = rows[0];
    const isExpired = new Date(verificationRecord.expires_at).getTime() < Date.now();
    if (isExpired) {
      return res.status(400).json({
        error: "This OTP has expired. Please request a new passcode."
      });
    }

    await pool.query("UPDATE otp_verifications SET used = 1 WHERE id = ?", [verificationRecord.id]);

    const finalUserId = verificationRecord.user_id || 1;
    const finalVoterId = verificationRecord.user_voter_id || cleanVoterId;

    const token = jwt.sign(
      { userId: finalUserId, role: "VOTER", email: cleanEmail, voterId: finalVoterId },
      process.env.JWT_SECRET || "supersecretjwtkeyforvotingapp123456789",
      { expiresIn: "12h" }
    );

    console.log(`✅ Voter identity and OTP successfully verified for ${cleanEmail} (${finalVoterId})`);

    res.json({
      ok: true,
      verified: true,
      token,
      voter: {
        userId: finalUserId,
        email: cleanEmail,
        voterId: finalVoterId
      },
      message: "Voter identity authenticated and OTP successfully verified."
    });
  } catch (err) {
    console.error("voter verify-otp error:", err);
    res.status(500).json({ error: err.message || "Failed to verify OTP." });
  }
});

module.exports = router;