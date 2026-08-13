const fs = require("fs");
const { ethers } = require("ethers");
const pool = require("../db/pool");

// Shared integrity check — used by both Admin and Voter sides
// so the exact same trustworthy logic runs everywhere.
async function verifyManifestoIntegrity(candidateId) {
  const [rows] = await pool.query(
    "SELECT * FROM attested_content WHERE candidate_id = ? AND content_type = 'MANIFESTO' ORDER BY attested_at DESC LIMIT 1",
    [candidateId]
  );
  if (!rows.length) return { found: false };
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

  return {
    found: true,
    intact,
    fileExists,
    originalHash: record.content_hash,
    currentHash,
    txHash: record.onchain_tx_hash,
    storageUri: record.storage_uri,
    message: !fileExists
      ? "❌ File missing from server storage"
      : intact
      ? "✅ Manifesto is authentic — matches the original uploaded version"
      : "❌ Warning — the displayed manifesto does not match the blockchain record"
  };
}

module.exports = { verifyManifestoIntegrity };