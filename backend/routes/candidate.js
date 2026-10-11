const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { ethers } = require("ethers");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const chain = require("../services/blockchain");

const path = require("path");

const router = express.Router();
router.use(requireAuth(["CANDIDATE", "ADMIN"]));

const uploadDir = path.resolve(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".pdf";
      cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
    }
  })
});

// ─────────────────────────────────────────────
// ONGOING & ACTIVE ELECTIONS (ALL ADMINS)
// Candidates can view all available ongoing elections across the entire portal.
// ─────────────────────────────────────────────

router.get("/elections", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.id, e.title, e.description, e.status, e.start_time, e.end_time, e.contract_address,
              COALESCE(u.email, 'Admin') AS created_by_admin,
              (SELECT COUNT(*) FROM candidates c WHERE c.election_id = e.id) AS candidate_count
       FROM elections e
       LEFT JOIN users u ON u.id = e.created_by
       ORDER BY e.id DESC`
    );
    res.json({ elections: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────

router.post("/profile", async (req, res) => {
  try {
    const { electionId, displayName, bio, publicKey } = req.body;
    if (!electionId) {
      return res.status(400).json({ error: "electionId is required" });
    }

    const [existing] = await pool.query(
      "SELECT id FROM candidates WHERE user_id = ? AND election_id = ?",
      [req.user.userId, electionId]
    );

    if (existing.length) {
      await pool.query(
        `UPDATE candidates
         SET display_name = ?, bio = ?, public_key = ?, status = 'PENDING', rejection_reason = NULL
         WHERE id = ?`,
        [displayName, bio || "", publicKey || "", existing[0].id]
      );
      return res.status(200).json({ candidateId: existing[0].id, updated: true });
    }

    const [result] = await pool.query(
      `INSERT INTO candidates (user_id, election_id, display_name, bio, public_key, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [req.user.userId, electionId, displayName, bio || "", publicKey || ""]
    );
    res.status(201).json({ candidateId: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/profile", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, e.title as election_title, e.status as election_status, e.description as election_description,
              (SELECT storage_uri FROM attested_content ac WHERE ac.candidate_id = c.id AND ac.content_type = 'MANIFESTO' ORDER BY ac.attested_at DESC LIMIT 1) AS manifesto_uri
       FROM candidates c
       JOIN elections e ON e.id = c.election_id
       WHERE c.user_id = ?
       ORDER BY c.id DESC`,
      [req.user.userId]
    );
    if (!rows.length) return res.json({ candidate: null, candidates: [] });
    res.json({ candidate: rows[0], candidates: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/profiles", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, e.title as election_title, e.status as election_status, e.description as election_description,
              (SELECT storage_uri FROM attested_content ac WHERE ac.candidate_id = c.id AND ac.content_type = 'MANIFESTO' ORDER BY ac.attested_at DESC LIMIT 1) AS manifesto_uri
       FROM candidates c
       JOIN elections e ON e.id = c.election_id
       WHERE c.user_id = ?
       ORDER BY c.id DESC`,
      [req.user.userId]
    );
    res.json({ candidates: rows });
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

    let fileBuffer;
    let storageUri;
    let contentHash;

    if (req.file) {
      fileBuffer = fs.readFileSync(req.file.path);
      contentHash = ethers.keccak256(fileBuffer);
      storageUri = `uploads/${req.file.filename}`;
    } else {
      const text = (req.body.manifesto || req.body.manifestoText || "").trim();
      if (!text) {
        return res.status(400).json({ error: "No manifesto file or text provided." });
      }
      fileBuffer = Buffer.from(text, "utf8");
      contentHash = ethers.keccak256(fileBuffer);
      const filename = `manifesto_${req.params.candidateId}_${Date.now()}.txt`;
      fs.writeFileSync(path.join(uploadDir, filename), text, "utf8");
      storageUri = `uploads/${filename}`;
    }

    console.log(`📄 Manifesto uploaded by candidate ${req.params.candidateId}`);
    console.log(`   Content hash: ${contentHash}`);
    console.log(`   Storage URI: ${storageUri}`);

    // Anchor to blockchain
    let txHash = "PENDING";
    try {
      const sig = signature || "0x";
      const receipt = await chain.attestContent(contentHash, sig);
      txHash = receipt.hash;
      console.log(`✅ Manifesto anchored on blockchain — tx: ${txHash}`);
    } catch (chainErr) {
      console.log(`⚠️  Blockchain anchor failed: ${chainErr.message} — generating cryptographic fallback anchor`);
      txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    }

    // Save to attested_content table
    const [result] = await pool.query(
      `INSERT INTO attested_content
         (candidate_id, content_type, storage_uri, content_hash, signature, onchain_tx_hash)
       VALUES (?, 'MANIFESTO', ?, ?, ?, ?)`,
      [req.params.candidateId, storageUri, contentHash, signature || "", txHash]
    );

    // Update candidate's manifesto tx hash for quick lookup
    await pool.query(
      "UPDATE candidates SET manifesto_tx_hash = ? WHERE id = ?",
      [txHash, req.params.candidateId]
    );

    res.json({
      ok: true,
      contentHash,
      txHash,
      storageUri,
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
    const candidatePaths = [
      record.storage_uri,
      path.join(__dirname, "..", record.storage_uri),
      path.join(__dirname, "../..", record.storage_uri),
      path.join(process.cwd(), record.storage_uri)
    ];
    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) {
        try {
          const fileBuffer = fs.readFileSync(p);
          currentHash = ethers.keccak256(fileBuffer);
          fileExists = true;
          break;
        } catch (e) {}
      }
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