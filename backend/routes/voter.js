const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const chain = require("../services/blockchain");
const { matchCandidates } = require("../services/ai_matching");
const { buildTree, getMerkleProof } = require("../services/merkle");

const router = express.Router();
router.use(requireAuth(["VOTER"]));

// Register for election — auto-approved if email + voter_id match the CSV roll
router.post("/elections/:id/register", async (req, res) => {
  try {
    const { identityCommitment } = req.body;
    if (!identityCommitment) {
      return res.status(400).json({ error: "identityCommitment required" });
    }

    const [rollCheck] = await pool.query(
      `SELECT vr.id FROM voter_rolls vr
       JOIN users u ON u.email = vr.email
       WHERE vr.election_id = ? AND u.id = ? AND vr.voter_id = u.voter_id`,
      [req.params.id, req.user.userId]
    );

    if (!rollCheck.length) {
      return res.status(403).json({
        error: "Your details are not on the eligible voter list for this election. Contact the election admin."
      });
    }

    const [existing] = await pool.query(
      "SELECT id FROM voters WHERE user_id = ? AND election_id = ?",
      [req.user.userId, req.params.id]
    );
    if (existing.length) {
      return res.status(409).json({ error: "Already registered for this election" });
    }

    const [[{ leafCount }]] = await pool.query(
      "SELECT COUNT(*) as leafCount FROM voters WHERE election_id = ? AND is_verified = TRUE",
      [req.params.id]
    );

    const [result] = await pool.query(
      `INSERT INTO voters (user_id, election_id, identity_commitment, merkle_leaf_index, is_verified)
       VALUES (?, ?, ?, ?, TRUE)`,
      [req.user.userId, req.params.id, identityCommitment, leafCount]
    );

    console.log(`✅ VOTER REGISTERED — election ${req.params.id}, userId ${req.user.userId}, leaf ${leafCount}`);
    res.status(201).json({
      voterRowId: result.insertId,
      leafIndex: leafCount,
      status: "APPROVED"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/elections/:id/registration-status", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT is_verified, merkle_leaf_index FROM voters WHERE user_id = ? AND election_id = ?",
      [req.user.userId, req.params.id]
    );
    if (!rows.length) return res.json({ status: "NOT_REGISTERED" });
    res.json({ status: rows[0].is_verified ? "APPROVED" : "PENDING" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/elections/:id/merkle-proof", async (req, res) => {
  try {
    const [voterRow] = await pool.query(
      "SELECT merkle_leaf_index, is_verified FROM voters WHERE user_id = ? AND election_id = ?",
      [req.user.userId, req.params.id]
    );
    if (!voterRow.length) {
      return res.status(404).json({ error: "Not registered for this election" });
    }
    if (!voterRow[0].is_verified) {
      return res.status(403).json({ error: "Not yet approved" });
    }

    const [allVoters] = await pool.query(
      "SELECT identity_commitment FROM voters WHERE election_id = ? AND is_verified = TRUE ORDER BY merkle_leaf_index ASC",
      [req.params.id]
    );
    const leaves = allVoters.map((v) => v.identity_commitment);
    const tree = await buildTree(leaves);
    const { pathElements, pathIndices } = getMerkleProof(tree, voterRow[0].merkle_leaf_index);

    res.json({ merkleRoot: tree.root, pathElements, pathIndices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/elections/:id/match", async (req, res) => {
  try {
    const { answers } = req.body;
    const [candidates] = await pool.query(
      "SELECT id as candidateId, display_name as name, stance_vector FROM candidates WHERE election_id = ? AND status = 'APPROVED'",
      [req.params.id]
    );
    const parsed = candidates.map((c) => ({
      candidateId: c.candidateId,
      name: c.name,
      stanceVector: typeof c.stance_vector === "string"
        ? JSON.parse(c.stance_vector || "{}")
        : (c.stance_vector || {})
    }));
    const ranked = matchCandidates(answers, parsed);

    const [voterRow] = await pool.query(
      "SELECT id FROM voters WHERE user_id = ? AND election_id = ?",
      [req.user.userId, req.params.id]
    );
    if (voterRow.length) {
      await pool.query(
        `INSERT INTO voter_preferences (voter_id, election_id, survey_answers, matched_results)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE survey_answers = VALUES(survey_answers), matched_results = VALUES(matched_results)`,
        [voterRow[0].id, req.params.id, JSON.stringify(answers), JSON.stringify(ranked)]
      );
    }
    res.json({ ranked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/elections/:id/cast-vote", async (req, res) => {
  try {
    const { pA, pB, pC, pubSignals } = req.body;
    const txStart = Date.now();
    const tx = await chain.voting.castVote(req.params.id, pA, pB, pC, pubSignals);
    const receipt = await tx.wait();
    const txTime = ((Date.now() - txStart) / 1000).toFixed(2);

    await pool.query(
      `INSERT INTO vote_receipts (election_id, nullifier_hash, tx_hash, block_number)
       VALUES (?, ?, ?, ?)`,
      [req.params.id, pubSignals[2], receipt.hash, receipt.blockNumber]
    );

    console.log(`✅ VOTE CAST — election ${req.params.id}, tx ${receipt.hash}, confirmed in ${txTime}s`);
    res.json({ txHash: receipt.hash, nullifierHash: pubSignals[2], txTime });
  } catch (err) {
    console.log(`❌ VOTE REJECTED — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get("/elections/:id/verify/:nullifierHash", async (req, res) => {
  try {
    const used = await chain.getNullifierStatus(req.params.id, req.params.nullifierHash);
    res.json({ counted: used });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;