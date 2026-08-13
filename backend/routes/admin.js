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
// VOTER ROLL
// ─────────────────────────────────────────────

router.post("/elections/:id/voter-roll", upload.single("file"), async (req, res) => {
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

router.get("/elections/:id/voter-roll", async (req, res) => {
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

router.get("/elections", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, status, start_time, end_time, created_at
       FROM elections ORDER BY created_at DESC`
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

router.post("/elections/:id/voter-root", async (req, res) => {
  try {
    await withRouteTimeout((async () => {
      const { buildTree } = require("../services/merkle");
      const [approved] = await pool.query(
        "SELECT identity_commitment FROM voters WHERE election_id = ? AND is_verified = TRUE ORDER BY merkle_leaf_index ASC",
        [req.params.id]
      );
      if (!approved.length) {
        const err = new Error("No approved voters yet");
        err.statusCode = 400;
        throw err;
      }
      const tree = await buildTree(approved.map(v => v.identity_commitment));
      await chain.setVoterRoot(req.params.id, tree.root);
      await pool.query("UPDATE elections SET merkle_root = ? WHERE id = ?", [tree.root, req.params.id]);
      res.json({ ok: true, root: tree.root, voterCount: approved.length });
    })(), "Publish Voter Root");
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post("/elections/:id/lock-voter-root", async (req, res) => {
  try {
    await withRouteTimeout(chain.lockVoterRoot(req.params.id), "Lock Voter Root");
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/elections/:id/open-onchain", async (req, res) => {
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
        "SELECT COUNT(*) as count FROM candidates WHERE election_id = ? AND status = 'APPROVED'",
        [req.params.id]
      );
      await chain.createElectionOnChain(req.params.id, e.title, startUnix, endUnix, count);
      await pool.query("UPDATE elections SET status = 'OPEN' WHERE id = ?", [req.params.id]);
      res.json({ ok: true, candidateCount: count });
    })(), "Open Election On-Chain");
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get("/elections/:id/results", async (req, res) => {
  try {
    const [candidates] = await pool.query(
      "SELECT id, display_name FROM candidates WHERE election_id = ? AND status = 'APPROVED' ORDER BY id",
      [req.params.id]
    );
    const results = [];
    for (let i = 0; i < candidates.length; i++) {
      const count = await chain.getTally(req.params.id, i);
      results.push({ candidateId: candidates[i].id, name: candidates[i].display_name, votes: Number(count) });
    }
    res.json({ results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/elections/:id", async (req, res) => {
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

router.get("/elections/:id/candidates", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.display_name, c.bio, c.status,
              c.stance_vector, c.stance_tx_hash, c.manifesto_tx_hash,
              (SELECT storage_uri FROM attested_content ac
                 WHERE ac.candidate_id = c.id AND ac.content_type = 'MANIFESTO'
                 ORDER BY ac.attested_at DESC LIMIT 1) AS manifesto_uri
       FROM candidates c
       WHERE c.election_id = ?
       ORDER BY c.id`,
      [req.params.id]
    );
    res.json({ candidates: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/candidates/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (status !== "APPROVED" && status !== "REJECTED") {
      return res.status(400).json({ error: "Status must be APPROVED or REJECTED" });
    }

    if (status === "APPROVED") {
      const [rows] = await pool.query(
        "SELECT * FROM candidates WHERE id = ?",
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: "Candidate not found" });
      const candidate = rows[0];

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
            "UPDATE candidates SET status = ?, stance_tx_hash = ? WHERE id = ?",
            [status, receipt.hash, req.params.id]
          );
          console.log(`✅ Stance anchored — tx: ${receipt.hash}`);
        } catch (chainErr) {
          console.log(`⚠️  Blockchain anchor failed: ${chainErr.message} — approving anyway`);
          await pool.query("UPDATE candidates SET status = ? WHERE id = ?", [status, req.params.id]);
        }
      } else {
        console.log(`⚠️  Candidate ${req.params.id} approved without stance survey`);
        await pool.query("UPDATE candidates SET status = ? WHERE id = ?", [status, req.params.id]);
      }
    } else {
      await pool.query("UPDATE candidates SET status = ? WHERE id = ?", [status, req.params.id]);
    }

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/elections/:id/voters", async (req, res) => {
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