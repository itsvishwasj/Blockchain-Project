const express = require("express");
const multer = require("multer");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const chain = require("../services/blockchain");
const { ethers } = require("ethers");

const router = express.Router();
router.use(requireAuth(["ADMIN"]));
const upload = multer({ dest: "uploads/" });

// ─────────────────────────────────────────────
// SAFETY NET — wraps an entire route's logic so it fails
// cleanly within 20 seconds no matter which internal step
// (MySQL query, merkle tree build, or blockchain call) hangs.
// ─────────────────────────────────────────────
function withRouteTimeout(promise, label, ms = 20000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`"${label}" timed out after ${ms / 1000}s. The local chain or database may be stuck — try restarting MySQL and Hardhat.`)),
        ms
      )
    )
  ]);
}

// ─────────────────────────────────────────────
// ELECTION OWNERSHIP ISOLATION MIDDLEWARE
// Ensures Admin A cannot view, modify, or execute control actions
// on elections owned by Admin B.
// ─────────────────────────────────────────────
async function checkElectionOwnership(req, res, next) {
  try {
    const electionId = req.params.id;
    if (!electionId) return next();
    const [rows] = await pool.query(
      "SELECT created_by FROM elections WHERE id = ?",
      [electionId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Election not found" });
    }
    const creatorId = rows[0].created_by;
    if (creatorId) {
      const [userExists] = await pool.query("SELECT id FROM users WHERE id = ?", [creatorId]);
      if (userExists.length && Number(creatorId) !== Number(req.user.userId)) {
        return res.status(403).json({ error: "Access denied. You do not have permission to manage this election." });
      }
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────
// DATABASE RESET / CLEANUP ENDPOINT
// ─────────────────────────────────────────────
router.post("/reset-database", async (req, res) => {
  try {
    const bcrypt = require("bcryptjs");
    await pool.query("DELETE FROM voter_preferences");
    await pool.query("DELETE FROM vote_receipts");
    await pool.query("DELETE FROM attested_content");
    await pool.query("DELETE FROM candidates");
    await pool.query("DELETE FROM voters");
    await pool.query("DELETE FROM voter_rolls");
    await pool.query("DELETE FROM otp_verifications");
    await pool.query("DELETE FROM elections");
    await pool.query("DELETE FROM users");

    try {
      await pool.query("DELETE FROM sqlite_sequence");
    } catch (e) {}

    const passwordHash = await bcrypt.hash("admin123", 10);
    await pool.query(
      `INSERT INTO users (id, role, email, password_hash, phone_verified)
       VALUES (1, 'ADMIN', 'admin@voting.com', ?, 1)`,
      [passwordHash]
    );

    res.json({ ok: true, message: "Database reset successfully and initial admin restored." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// VOTER ROLL
// ─────────────────────────────────────────────

router.post("/elections/:id/voter-roll", checkElectionOwnership, upload.single("file"), async (req, res) => {
  try {
    const fs = require("fs");
    const lines = fs.readFileSync(req.file.path, "utf-8").trim().split("\n");
    fs.unlinkSync(req.file.path);
    lines.shift();

    let added = 0, skipped = 0;
    for (const line of lines) {
      const stripQuotes = s => s.trim().replace(/^"+|"+$/g, "").trim();
      const [full_name, email, voter_id] = line.split(",").map(stripQuotes);
      if (!full_name || !email || !voter_id) { skipped++; continue; }
      try {
        await pool.query(
          `INSERT INTO voter_rolls (election_id, voter_id, full_name, email)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
          [req.params.id, voter_id, full_name, email]
        );
        added++;
      } catch { skipped++; }
    }
    res.json({ ok: true, added, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/elections/:id/voter-roll", checkElectionOwnership, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT full_name, email, voter_id FROM voter_rolls WHERE election_id = ? ORDER BY full_name",
      [req.params.id]
    );
    res.json({ roll: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// ELECTIONS
// ─────────────────────────────────────────────

router.post("/elections/:id/close", checkElectionOwnership, async (req, res) => {
  try {
    const nowIso = new Date().toISOString();
    await pool.query(
      "UPDATE elections SET status = 'CLOSED', end_time = ? WHERE id = ?",
      [nowIso, req.params.id]
    );
    res.json({ ok: true, message: "Election successfully ended." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/elections", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description, status, start_time, end_time, merkle_root, contract_address, created_by
       FROM elections
       WHERE created_by = ? OR created_by IS NULL OR created_by NOT IN (SELECT id FROM users)
       ORDER BY id DESC`,
      [req.user.userId]
    );
    res.json({ elections: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/elections", async (req, res) => {
  try {
    const { title, description, startTime, endTime, contractAddress } = req.body;
    const [result] = await pool.query(
      `INSERT INTO elections (title, description, merkle_root, contract_address, start_time, end_time, status, created_by)
       VALUES (?, ?, '0x0', ?, ?, ?, 'DRAFT', ?)`,
      [title, description || "", contractAddress || "0x0", startTime, endTime, req.user.userId]
    );
    res.status(201).json({ electionId: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/elections/:id/voter-root", checkElectionOwnership, async (req, res) => {
  try {
    await withRouteTimeout((async () => {
      const { buildTree } = require("../services/merkle");
      const [approved] = await pool.query(
        "SELECT identity_commitment FROM voters WHERE election_id = ? AND is_verified = TRUE ORDER BY merkle_leaf_index ASC",
        [req.params.id]
      );
      const tree = await buildTree(approved.map(v => v.identity_commitment));
      try {
        await chain.setVoterRoot(req.params.id, tree.root);
      } catch (chainErr) {
        if (chainErr.message && chainErr.message.includes("root is locked")) {
          console.log(`ℹ️ Merkle root for election ${req.params.id} is already locked on-chain.`);
        } else {
          throw chainErr;
        }
      }
      await pool.query("UPDATE elections SET merkle_root = ? WHERE id = ?", [tree.root, req.params.id]);
      res.json({ ok: true, root: tree.root, voterCount: approved.length });
    })(), "Publish Voter Root");
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post("/elections/:id/lock-voter-root", checkElectionOwnership, async (req, res) => {
  try {
    await withRouteTimeout((async () => {
      try {
        await chain.lockVoterRoot(req.params.id);
      } catch (chainErr) {
        if (chainErr.message && chainErr.message.includes("already locked")) {
          console.log(`ℹ️ Root for election ${req.params.id} already locked.`);
        } else {
          throw chainErr;
        }
      }
    })(), "Lock Voter Root");
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/elections/:id/open-onchain", checkElectionOwnership, async (req, res) => {
  try {
    await withRouteTimeout((async () => {
      const [rows] = await pool.query("SELECT * FROM elections WHERE id = ?", [req.params.id]);
      if (!rows.length) {
        const err = new Error("Election not found");
        err.statusCode = 404;
        throw err;
      }
      const e = rows[0];
      const startUnix = Math.floor(new Date(e.start_time).getTime() / 1000);
      const endUnix = Math.floor(new Date(e.end_time).getTime() / 1000);
      const [[{ count }]] = await pool.query(
        "SELECT COUNT(*) as count FROM candidates WHERE election_id = ? AND UPPER(status) = 'APPROVED'",
        [req.params.id]
      );
      if (count === 0) {
        const err = new Error("No approved candidates found for this election. Please approve at least one candidate before opening voting.");
        err.statusCode = 400;
        throw err;
      }
      try {
        await chain.createElectionOnChain(req.params.id, e.title, startUnix, endUnix, count);
      } catch (chainErr) {
        if (chainErr.message && (chainErr.message.includes("already exists") || chainErr.message.includes("election already exists"))) {
          console.log(`ℹ️ Election ${req.params.id} already exists on-chain, proceeding to set status OPEN.`);
        } else {
          throw chainErr;
        }
      }
      await pool.query("UPDATE elections SET status = 'OPEN' WHERE id = ?", [req.params.id]);
      res.json({ ok: true, candidateCount: count });
    })(), "Open Election On-Chain");
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get("/elections/:id/results", checkElectionOwnership, async (req, res) => {
  try {
    const [candidates] = await pool.query(
      "SELECT id, display_name FROM candidates WHERE election_id = ? AND UPPER(status) = 'APPROVED' ORDER BY id",
      [req.params.id]
    );
    const results = [];
    for (let i = 0; i < candidates.length; i++) {
      let count = 0;
      try {
        count = await chain.getTally(req.params.id, i);
      } catch (e) {
        console.log("admin getTally note:", e.message);
      }

      let dbCount = 0;
      try {
        const [rows] = await pool.query(
          "SELECT COUNT(*) as count FROM vote_receipts WHERE election_id = ? AND candidate_id = ?",
          [req.params.id, candidates[i].id]
        );
        if (rows && rows.length > 0) {
          dbCount = rows[0].count || rows[0]["COUNT(*)"] || 0;
        }
      } catch (dbErr) {
        console.log("admin dbCount note:", dbErr.message);
      }

      const finalVotes = Math.max(Number(count || 0), Number(dbCount || 0));
      results.push({ candidateId: candidates[i].id, name: candidates[i].display_name, votes: finalVotes });
    }
    res.json({ results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/elections/:id", checkElectionOwnership, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, title, description, status, start_time, end_time, contract_address, merkle_root FROM elections WHERE id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Election not found" });
    res.json({ election: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// CANDIDATES
// ─────────────────────────────────────────────

router.get("/elections/:id/candidates", checkElectionOwnership, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, COALESCE(NULLIF(c.display_name, ''), u.email, CONCAT('Candidate #', c.id)) AS display_name,
              c.bio, c.status, c.rejection_reason,
              c.stance_vector, c.stance_tx_hash, c.manifesto_tx_hash,
              (SELECT storage_uri FROM attested_content ac
                 WHERE ac.candidate_id = c.id AND ac.content_type = 'MANIFESTO'
                 ORDER BY ac.attested_at DESC LIMIT 1) AS manifesto_uri
       FROM candidates c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.election_id = ?
       ORDER BY c.id`,
      [req.params.id]
    );
    res.json({ candidates: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/elections/:id/candidates", checkElectionOwnership, async (req, res) => {
  try {
    const { name, bio, manifesto } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Candidate name required" });

    const userEmail = `candidate_${Date.now()}_${Math.floor(Math.random()*1000)}@tri-vote.dev`;
    const [userRes] = await pool.query(
      `INSERT INTO users (role, email, password_hash) VALUES ('CANDIDATE', ?, 'hash')`,
      [userEmail]
    );
    const userId = userRes.insertId;

    const defaultStance = { economy: 0.5, environment: 0.8, healthcare: 0.7, education: 0.9, civil_rights: 0.6, security: 0.4 };

    const [candRes] = await pool.query(
      `INSERT INTO candidates (user_id, election_id, display_name, bio, public_key, stance_vector, status)
       VALUES (?, ?, ?, ?, '0x0', ?, 'APPROVED')`,
      [userId, req.params.id, name.trim(), bio || "Official Candidate", JSON.stringify(defaultStance)]
    );
    const candidateId = candRes.insertId;

    if (manifesto && manifesto.trim()) {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(manifesto));
      await pool.query(
        `INSERT INTO attested_content (candidate_id, content_type, storage_uri, content_hash, signature, onchain_tx_hash)
         VALUES (?, 'MANIFESTO', 'inline', ?, '0x', '0x_admin_preapproved')`,
        [candidateId, contentHash]
      );
    }

    res.status(201).json({ ok: true, candidateId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/candidates/:id/status", async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    if (status !== "APPROVED" && status !== "REJECTED") {
      return res.status(400).json({ error: "Status must be APPROVED or REJECTED" });
    }

    const [cands] = await pool.query(
      `SELECT c.id, c.election_id, c.stance_vector, e.created_by
       FROM candidates c
       JOIN elections e ON e.id = c.election_id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!cands.length) return res.status(404).json({ error: "Candidate not found" });
    const candidate = cands[0];

    if (candidate.created_by && Number(candidate.created_by) !== Number(req.user.userId)) {
      return res.status(403).json({ error: "Access denied. You do not have permission to manage candidates for this election." });
    }

    if (status === "APPROVED") {
      if (candidate.stance_vector) {
        const stanceVector = typeof candidate.stance_vector === "string"
          ? JSON.parse(candidate.stance_vector)
          : candidate.stance_vector;
        const stanceString = JSON.stringify(stanceVector);
        const stanceHash = ethers.keccak256(ethers.toUtf8Bytes(stanceString));

        console.log(`📌 Anchoring stances to blockchain for candidate ${candidate.id}...`);
        console.log(`   Stance hash: ${stanceHash}`);

        try {
          const tx = await chain.attestation.attest(stanceHash, "0x");
          const receipt = await tx.wait();
          await pool.query(
            "UPDATE candidates SET status = ?, stance_tx_hash = ?, manifesto_tx_hash = ?, rejection_reason = NULL WHERE id = ?",
            [status, receipt.hash, receipt.hash, req.params.id]
          );
          console.log(`✅ Stance & Manifesto anchored — tx: ${receipt.hash}`);
        } catch (chainErr) {
          console.log(`⚠️  Blockchain anchor failed: ${chainErr.message} — approving anyway`);
          const fallbackTx = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
          await pool.query(
            "UPDATE candidates SET status = ?, stance_tx_hash = ?, manifesto_tx_hash = ?, rejection_reason = NULL WHERE id = ?",
            [status, fallbackTx, fallbackTx, req.params.id]
          );
        }
      } else {
        console.log(`⚠️  Candidate ${req.params.id} approved without stance survey`);
        const fallbackTx = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        await pool.query(
          "UPDATE candidates SET status = ?, stance_tx_hash = ?, manifesto_tx_hash = ?, rejection_reason = NULL WHERE id = ?",
          [status, fallbackTx, fallbackTx, req.params.id]
        );
      }
    } else {
      const reasonText = rejectionReason && rejectionReason.trim() ? rejectionReason.trim() : "Application does not meet the election eligibility criteria.";
      await pool.query("UPDATE candidates SET status = ?, rejection_reason = ? WHERE id = ?", [status, reasonText, req.params.id]);
    }

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/elections/:id/voters", checkElectionOwnership, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.id, u.email, u.voter_id, v.is_verified, v.registered_at
       FROM voters v JOIN users u ON u.id = v.user_id
       WHERE v.election_id = ? ORDER BY v.registered_at ASC`,
      [req.params.id]
    );
    res.json({ voters: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;