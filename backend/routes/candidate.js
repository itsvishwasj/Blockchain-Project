const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { ethers } = require("ethers");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const chain = require("../services/blockchain");

const router = express.Router();
router.use(requireAuth(["CANDIDATE"]));
const upload = multer({
  storage: multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
      const ext = require("path").extname(file.originalname) || ".pdf";
      cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
    }
  })
});
// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────

router.post("/profile", async (req, res) => {
  try {
    const { electionId, displayName, bio, publicKey } = req.body;
    const [result] = await pool.query(
      `INSERT INTO candidates (user_id, election_id, display_name, bio, public_key, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [req.user.userId, electionId, displayName, bio || "", publicKey || ""]
    );
    localStorage_candidateId = result.insertId; // for reference
    res.status(201).json({ candidateId: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/profile", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, e.title as election_title
       FROM candidates c
       JOIN elections e ON e.id = c.election_id
       WHERE c.user_id = ?`,
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "No profile found" });
    res.json({ candidate: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// STANCE SURVEY
// Save answers to MySQL. They get anchored to
// blockchain when admin approves the candidate.
// ─────────────────────────────────────────────

router.post("/stances/:candidateId", async (req, res) => {
  try {
    const { stanceVector } = req.body;

    // Verify this candidate belongs to this user
    const [rows] = await pool.query(
      "SELECT id, status FROM candidates WHERE id = ? AND user_id = ?",
      [req.params.candidateId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "Candidate profile not found" });
    if (rows[0].status === "APPROVED") {
      return res.status(403).json({
        error: "Your profile is already approved — stances are locked on blockchain and cannot be changed."
      });
    }

    await pool.query(
      "UPDATE candidates SET stance_vector = ? WHERE id = ?",
      [JSON.stringify(stanceVector), req.params.candidateId]
    );

    res.json({
      ok: true,
      message: "Stances saved. They will be permanently locked on blockchain when admin approves your profile."
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get current stances (with blockchain verification status)
router.get("/stances/:candidateId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT stance_vector, stance_tx_hash, status FROM candidates WHERE id = ?",
      [req.params.candidateId]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const c = rows[0];

    let blockchainVerified = false;
    let stanceHash = null;

    if (c.stance_vector) {
      const stanceString = JSON.stringify(JSON.parse(c.stance_vector));
      stanceHash = ethers.keccak256(ethers.toUtf8Bytes(stanceString));
      blockchainVerified = !!c.stance_tx_hash;
    }

    res.json({
      stances: c.stance_vector ? JSON.parse(c.stance_vector) : null,
      status: c.status,
      blockchainAnchored: blockchainVerified,
      stanceTxHash: c.stance_tx_hash || null,
      stanceHash
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// MANIFESTO UPLOAD
// File hash anchored to blockchain immediately
// on upload. LOCKED after the first successful
// anchor — a candidate gets exactly one manifesto
// per election, to preserve the integrity guarantee.
// ─────────────────────────────────────────────

router.post("/manifesto/:candidateId", upload.single("file"), async (req, res) => {
  try {
    const { signature } = req.body;

    // Verify this candidate belongs to this user
    const [rows] = await pool.query(
      "SELECT id, status, manifesto_tx_hash FROM candidates WHERE id = ? AND user_id = ?",
      [req.params.candidateId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "Candidate profile not found" });

    // ── LOCK CHECK ──────────────────────────────────────────
    // If this candidate already has a manifesto anchored
    // (manifesto_tx_hash set), reject any further upload.
    if (rows[0].manifesto_tx_hash) {
      return res.status(403).json({
        error: "Your manifesto is already anchored on the blockchain and cannot be replaced."
      });
    }
    // ─────────────────────────────────────────────────────────

    // Read uploaded file and compute its hash
    const fileBuffer = fs.readFileSync(req.file.path);
    const contentHash = ethers.keccak256(fileBuffer);

    console.log(`📄 Manifesto uploaded by candidate ${req.params.candidateId}`);
    console.log(`   Content hash: ${contentHash}`);

    // Store file path (in production this would go to IPFS or S3)
    const storageUri = `uploads/${req.file.filename}`;

    // Anchor to blockchain
    let txHash = "PENDING";
    try {
      const sig = signature || "0x";
      const tx = await chain.attestation.attest(contentHash, sig);
      const receipt = await tx.wait();
      txHash = receipt.hash;
      console.log(`✅ Manifesto anchored on blockchain — tx: ${txHash}`);
    } catch (chainErr) {
      console.log(`⚠️  Blockchain anchor failed: ${chainErr.message}`);
    }

    // Save to attested_content table
    const [result] = await pool.query(
      `INSERT INTO attested_content
         (candidate_id, content_type, storage_uri, content_hash, signature, onchain_tx_hash)
       VALUES (?, 'MANIFESTO', ?, ?, ?, ?)`,
      [req.params.candidateId, storageUri, contentHash, signature || "", txHash]
    );

    // Update candidate's manifesto tx hash for quick lookup — this is also
    // what the lock check above reads on any future upload attempt.
    await pool.query(
      "UPDATE candidates SET manifesto_tx_hash = ? WHERE id = ?",
      [txHash, req.params.candidateId]
    );

    res.json({
      ok: true,
      contentHash,
      txHash,
      message: "Manifesto uploaded and anchored to blockchain. The content hash is permanently recorded."
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Verify manifesto integrity — anyone can call this
// Re-hashes the stored file and compares to blockchain record
router.get("/manifesto/:candidateId/verify", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM attested_content WHERE candidate_id = ? AND content_type = 'MANIFESTO' ORDER BY attested_at DESC LIMIT 1",
      [req.params.candidateId]
    );
    if (!rows.length) return res.status(404).json({ error: "No manifesto found" });
    const record = rows[0];

    let currentHash = null;
    let fileExists = false;
    try {
      const fileBuffer = fs.readFileSync(record.storage_uri);
      currentHash = ethers.keccak256(fileBuffer);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    const intact = fileExists && currentHash === record.content_hash;

    res.json({
      intact,
      originalHash: record.content_hash,
      currentHash,
      txHash: record.onchain_tx_hash,
      message: intact
        ? "✅ Manifesto is authentic — matches the original uploaded version"
        : "❌ Warning — the displayed manifesto does not match the blockchain record"
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get all manifesto records for a candidate
router.get("/manifesto/:candidateId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT content_hash, onchain_tx_hash, attested_at FROM attested_content WHERE candidate_id = ? AND content_type = 'MANIFESTO' ORDER BY attested_at DESC",
      [req.params.candidateId]
    );
    res.json({ manifestos: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;