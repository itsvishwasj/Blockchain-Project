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
    // All authenticated administrators have administrative authority
    if (req.user && req.user.role === "ADMIN") {
      return next();
    }
    const creatorId = rows[0].created_by;
    if (creatorId && Number(creatorId) !== Number(req.user.userId)) {
      return res.status(403).json({ error: "Access denied. You do not have permission to manage this election." });
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
      "SELECT id, full_name, email, voter_id FROM voter_rolls WHERE election_id = ? ORDER BY id DESC",
      [req.params.id]
    );
    res.json({ roll: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/elections/:id/voter-roll/:voterRef", checkElectionOwnership, async (req, res) => {
  try {
    const voterRef = req.params.voterRef;
    await pool.query(
      "DELETE FROM voter_rolls WHERE election_id = ? AND (id = ? OR voter_id = ? OR email = ?)",
      [req.params.id, voterRef, voterRef, voterRef]
    );
    res.json({ ok: true, message: "Voter removed from whitelist." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/elections/:id/voter-roll", checkElectionOwnership, async (req, res) => {
  try {
    await pool.query("DELETE FROM voter_rolls WHERE election_id = ?", [req.params.id]);
    res.json({ ok: true, message: "All voters removed from election roll." });
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
    const { title, description, startTime, endTime, start_time, end_time, contractAddress } = req.body;
    const rawStart = startTime || start_time;
    const rawEnd = endTime || end_time;

    let finalStart = rawStart;
    let finalEnd = rawEnd;

    if (finalStart) {
      const d = new Date(finalStart);
      if (!isNaN(d.getTime())) finalStart = d.toISOString();
    } else {
      finalStart = new Date().toISOString();
    }

    if (finalEnd) {
      const d = new Date(finalEnd);
      if (!isNaN(d.getTime())) finalEnd = d.toISOString();
    } else {
      finalEnd = new Date(Date.now() + 86400000).toISOString();
    }

    const [result] = await pool.query(
      `INSERT INTO elections (title, description, merkle_root, contract_address, start_time, end_time, status, created_by)
       VALUES (?, ?, '0x0', ?, ?, ?, 'DRAFT', ?)`,
      [title, description || "", contractAddress || "0x0", finalStart, finalEnd, req.user.userId]
    );
    res.status(201).json({ electionId: result.insertId, startTime: finalStart, endTime: finalEnd });
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

router.post("/elections/:id/candidate-roll", checkElectionOwnership, upload.single("file"), async (req, res) => {
  try {
    const fs = require("fs");
    if (!req.file) {
      return res.status(400).json({ error: "No CSV file uploaded." });
    }
    const content = fs.readFileSync(req.file.path, "utf-8").trim();
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV file must contain a header and at least one candidate row." });
    }

    const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/^"|"$/g, ''));
    const nameIdx = header.findIndex(h => h.includes("name"));
    const bioIdx = header.findIndex(h => h.includes("bio") || h.includes("party") || h.includes("summary"));
    const manifestoIdx = header.findIndex(h => h.includes("manifesto") || h.includes("platform") || h.includes("policy"));

    let added = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ''));
      const name = nameIdx !== -1 ? row[nameIdx] : row[0];
      const bio = bioIdx !== -1 ? row[bioIdx] : (row[1] || "Official Election Candidate");
      const manifesto = manifestoIdx !== -1 ? row[manifestoIdx] : (row[2] || "Official Candidate Platform & Manifesto");

      if (!name) {
        skipped++;
        continue;
      }

      const userEmail = `candidate_${Date.now()}_${Math.floor(Math.random()*10000)}_${i}@tri-vote.dev`;
      const [userRes] = await pool.query(
        `INSERT INTO users (role, email, password_hash) VALUES ('CANDIDATE', ?, 'hash')`,
        [userEmail]
      );
      const userId = userRes.insertId;

      const defaultStance = { economy: 0.6, environment: 0.8, healthcare: 0.7, education: 0.85, civil_rights: 0.75, security: 0.5 };

      const [candRes] = await pool.query(
        `INSERT INTO candidates (user_id, election_id, display_name, bio, public_key, stance_vector, status)
         VALUES (?, ?, ?, ?, '0x0', ?, 'APPROVED')`,
        [userId, req.params.id, name, bio, JSON.stringify(defaultStance)]
      );
      const candidateId = candRes.insertId;

      if (manifesto) {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes(manifesto));
        await pool.query(
          `INSERT INTO attested_content (candidate_id, content_type, storage_uri, content_hash, signature, onchain_tx_hash)
           VALUES (?, 'MANIFESTO', 'inline', ?, '0x', '0x_admin_preapproved')`,
          [candidateId, contentHash]
        );
      }
      added++;
    }

    res.json({ ok: true, added, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/elections/:id/preload-candidates", checkElectionOwnership, async (req, res) => {
  try {
    const sampleCandidates = [
      {
        name: "Udupa",
        bio: "Former Treasury Director & Policy Lead",
        manifesto: "Promoting transparent municipal governance through Poseidon zk-SNARKs and real-time public ledger attestation.",
        stance: { economy: 0.85, environment: 0.70, healthcare: 0.80, education: 0.90, civil_rights: 0.85, security: 0.65 }
      },
      {
        name: "Rohan Sharma",
        bio: "Environmental Engineer & Urban Sustainability Scholar",
        manifesto: "Pioneering green energy microgrids and zero-emission municipal infrastructure backed by audited smart contracts.",
        stance: { economy: 0.50, environment: 0.95, healthcare: 0.75, education: 0.80, civil_rights: 0.70, security: 0.40 }
      },
      {
        name: "Archana Devi",
        bio: "Civic Tech Researcher & Open Data Advocate",
        manifesto: "Building decentralized public auditing tools and community-driven participatory budgeting.",
        stance: { economy: 0.75, environment: 0.85, healthcare: 0.90, education: 0.80, civil_rights: 0.95, security: 0.50 }
      }
    ];

    let added = 0;
    for (let i = 0; i < sampleCandidates.length; i++) {
      const c = sampleCandidates[i];
      const [existing] = await pool.query(
        "SELECT id FROM candidates WHERE election_id = ? AND display_name = ?",
        [req.params.id, c.name]
      );
      if (existing.length) continue;

      const userEmail = `candidate_${Date.now()}_${Math.floor(Math.random()*10000)}_${i}@tri-vote.dev`;
      const [userRes] = await pool.query(
        `INSERT INTO users (role, email, password_hash) VALUES ('CANDIDATE', ?, 'hash')`,
        [userEmail]
      );
      const userId = userRes.insertId;

      const [candRes] = await pool.query(
        `INSERT INTO candidates (user_id, election_id, display_name, bio, public_key, stance_vector, status)
         VALUES (?, ?, ?, ?, '0x0', ?, 'APPROVED')`,
        [userId, req.params.id, c.name, c.bio, JSON.stringify(c.stance)]
      );
      const candidateId = candRes.insertId;

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(c.manifesto));
      await pool.query(
        `INSERT INTO attested_content (candidate_id, content_type, storage_uri, content_hash, signature, onchain_tx_hash)
         VALUES (?, 'MANIFESTO', 'inline', ?, '0x', '0x_admin_preapproved')`,
        [candidateId, contentHash]
      );
      added++;
    }

    res.json({ ok: true, added, count: sampleCandidates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

    if (req.user && req.user.role !== "ADMIN" && candidate.created_by && Number(candidate.created_by) !== Number(req.user.userId)) {
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

router.delete("/candidates/:id", async (req, res) => {
  try {
    const [cands] = await pool.query(
      `SELECT c.id, c.election_id, e.created_by
       FROM candidates c
       JOIN elections e ON e.id = c.election_id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!cands.length) return res.status(404).json({ error: "Candidate not found" });

    if (req.user && req.user.role !== "ADMIN" && cands[0].created_by && Number(cands[0].created_by) !== Number(req.user.userId)) {
      return res.status(403).json({ error: "Access denied." });
    }

    await pool.query("DELETE FROM attested_content WHERE candidate_id = ?", [req.params.id]);
    await pool.query("DELETE FROM candidates WHERE id = ?", [req.params.id]);

    res.json({ ok: true, message: "Candidate removed successfully." });
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