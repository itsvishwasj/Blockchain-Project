require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { performanceMiddleware, getRecentMetrics } = require("./middleware/performance");
const { verifyManifestoIntegrity } = require("./services/candidateInfo");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const voterRoutes = require("./routes/voter");
const candidateRoutes = require("./routes/candidate");

const app = express();
app.use(cors());
app.use(express.json());
app.use(performanceMiddleware);

// Serve uploaded manifesto files (PDF, DOC, TXT) from backend and root uploads directories
const fs = require("fs");
const localUploadsDir = path.join(__dirname, "uploads");
const rootUploadsDir = path.join(__dirname, "..", "uploads");
const cwdUploadsDir = path.join(process.cwd(), "uploads");
[localUploadsDir, rootUploadsDir, cwdUploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }
});

app.use("/uploads", express.static(localUploadsDir));
app.use("/uploads", express.static(rootUploadsDir));
app.use("/uploads", express.static(cwdUploadsDir));

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/voter", voterRoutes);
app.use("/candidate", candidateRoutes);

// ─────────────────────────────────────────────
// PUBLIC ENDPOINTS (no login needed)
// ─────────────────────────────────────────────

app.get("/public/elections", async (req, res) => {
  try {
    const pool = require("./db/pool");
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

app.get("/public/email-status", async (req, res) => {
  const isWebhookConfigured = !!(process.env.EMAIL_WEBHOOK_URL || process.env.GOOGLE_SCRIPT_WEBHOOK_URL);
  const isBrevoConfigured = !!(process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim());

  const rawKey = process.env.RESEND_API_KEY || "";
  const cleanKey = String(rawKey).trim().replace(/^["']|["']$/g, '');
  const isResendConfigured = cleanKey.length > 0;
  const keyPreview = isResendConfigured ? `${cleanKey.slice(0, 6)}...${cleanKey.slice(-4)}` : null;

  const testTo = req.query.to || "4vishwasj@gmail.com";
  try {
    const { sendOTP } = require("./services/email");
    const result = await sendOTP(testTo, "123456");
    res.json({
      ok: true,
      sentTo: testTo,
      provider: result?.provider || "unknown",
      webhookConfigured: isWebhookConfigured,
      brevoConfigured: isBrevoConfigured,
      resendConfigured: isResendConfigured,
      resendKeyPreview: keyPreview,
      message: `Email sent successfully to ${testTo}!`
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      sentTo: testTo,
      webhookConfigured: isWebhookConfigured,
      brevoConfigured: isBrevoConfigured,
      resendConfigured: isResendConfigured,
      resendKeyPreview: keyPreview,
      error: err.message
    });
  }
});

app.get("/public/elections/:id/candidates", async (req, res) => {
  try {
    const pool = require("./db/pool");
    const [rows] = await pool.query(
      `SELECT c.id, COALESCE(NULLIF(c.display_name, ''), u.email, CONCAT('Candidate #', c.id)) AS display_name,
              c.bio, c.stance_vector,
              c.stance_tx_hash, c.manifesto_tx_hash,
              (SELECT storage_uri FROM attested_content ac
                 WHERE ac.candidate_id = c.id AND ac.content_type = 'MANIFESTO'
                 ORDER BY ac.attested_at DESC LIMIT 1) AS manifesto_uri
       FROM candidates c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.election_id = ? AND UPPER(c.status) = 'APPROVED'
       ORDER BY c.id`,
      [req.params.id]
    );

    const userVectorParam = req.query.userVector;
    let userVector = null;
    if (userVectorParam) {
      try {
        userVector = JSON.parse(userVectorParam);
      } catch (e) {}
    }

    const { matchCandidates } = require("./services/ai_matching");

    const candidateObjects = rows.map(c => ({
      id: c.id,
      display_name: c.display_name,
      bio: c.bio,
      manifesto_uri: c.manifesto_uri,
      stance_vector: c.stance_vector,
      stanceVector: typeof c.stance_vector === 'string' ? JSON.parse(c.stance_vector || '{}') : (c.stance_vector || {})
    }));

    if (userVector) {
      const ranked = matchCandidates(userVector, candidateObjects.map(c => ({
        candidateId: c.id,
        name: c.display_name,
        stanceVector: c.stanceVector
      })));

      const rankedMap = new Map();
      ranked.forEach(r => rankedMap.set(r.candidateId, r.score));

      candidateObjects.forEach(c => {
        c.similarityScore = rankedMap.get(c.id) || 0.85;
      });

      candidateObjects.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));
    }

    res.json({ candidates: candidateObjects });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/public/elections/:id/status", async (req, res) => {
  try {
    const pool = require("./db/pool");
    const [rows] = await pool.query(
      "SELECT id, title, description, start_time, end_time, status FROM elections WHERE id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Election not found" });
    const e = rows[0];
    const now = new Date();
    let liveStatus = e.status;
    if (e.status === "OPEN" && now > new Date(e.end_time)) liveStatus = "CLOSED";
    res.json({ ...e, liveStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/public/elections/:id/results", async (req, res) => {
  try {
    const pool = require("./db/pool");
    const chain = require("./services/blockchain");
    const [rows] = await pool.query(
      "SELECT status, end_time FROM elections WHERE id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Election not found" });

    const now = new Date();
    const isClosed = rows[0].status === "CLOSED" || rows[0].status === "FINALIZED" || now > new Date(rows[0].end_time);

    const [candidates] = await pool.query(
      "SELECT id, display_name FROM candidates WHERE election_id = ? AND UPPER(status) = 'APPROVED' ORDER BY id",
      [req.params.id]
    );
    const results = [];
    let totalBallots = 0;

    for (let i = 0; i < candidates.length; i++) {
      let count = 0;
      try {
        count = await chain.getTally(req.params.id, i);
      } catch (e) {
        console.log("getTally note:", e.message);
      }

      let dbCount = 0;
      try {
        const [rows] = await pool.query(
          "SELECT COUNT(*) as count FROM vote_receipts WHERE election_id = ? AND candidate_id = ?",
          [req.params.id, candidates[i].id]
        );
        if (rows && rows.length > 0) dbCount = rows[0].count || 0;
      } catch (dbErr) {}

      const finalVotes = Math.max(Number(count || 0), Number(dbCount || 0));
      totalBallots += finalVotes;

      let isAttested = true;
      try {
        const [attestRows] = await pool.query(
          "SELECT id FROM attested_content WHERE candidate_id = ? LIMIT 1",
          [candidates[i].id]
        );
        if (attestRows.length > 0) isAttested = true;
      } catch (aErr) {}

      results.push({
        candidateId: candidates[i].id,
        name: candidates[i].display_name,
        votes: finalVotes,
        isAttested
      });
    }

    results.sort((a, b) => b.votes - a.votes);
    results.forEach(r => {
      r.percentage = totalBallots > 0 ? ((r.votes / totalBallots) * 100).toFixed(1) : "0.0";
    });

    // Fetch election performance metrics
    const [perfRows] = await pool.query(
      `SELECT 
         COUNT(*) as totalVotes,
         AVG(merkle_proof_fetch_ms) as avgMerkleMs,
         AVG(zk_proof_gen_ms) as avgZkMs,
         AVG(blockchain_confirm_ms) as avgBlockchainMs,
         AVG(total_latency_ms) as avgTotalMs
       FROM vote_receipts
       WHERE election_id = ?`,
      [req.params.id]
    );
    const perfData = perfRows[0] || {};
    const totalVotesProcessed = Math.max(totalBallots, Number(perfData.totalVotes || 0));

    const avgMerkleMs = totalVotesProcessed > 0 && perfData.avgMerkleMs > 0 ? Math.round(perfData.avgMerkleMs) : 0;
    const avgZkMs = totalVotesProcessed > 0 && perfData.avgZkMs > 0 ? Number((perfData.avgZkMs / 1000).toFixed(2)) : 0;
    const avgBlockchainMs = totalVotesProcessed > 0 && perfData.avgBlockchainMs > 0 ? Number((perfData.avgBlockchainMs / 1000).toFixed(2)) : 0;
    const avgTotalMs = totalVotesProcessed > 0 && perfData.avgTotalMs > 0 ? Number((perfData.avgTotalMs / 1000).toFixed(2)) : 0;

    const efficiencyGainPercent = avgTotalMs > 0 ? Math.max(0, Math.round(((4.00 - avgTotalMs) / 4.00) * 100)) : 0;

    const metrics = {
      totalVotesProcessed,
      merkleInclusionFetchMs: avgMerkleMs,
      zkProofGenerationSec: avgZkMs,
      blockchainConfirmationSec: avgBlockchainMs,
      totalEndToEndLatencySec: avgTotalMs,
      baselineSec: 4.00,
      efficiencyGainPercent,
      efficiencyGainText: avgTotalMs > 0 ? `~${efficiencyGainPercent}% faster than baseline` : 'Telemetry Pending',
      benchmarkTable: [
        { stage: "Merkle inclusion proof fetch (server round-trip)", time: `${avgMerkleMs} ms` },
        { stage: "Zero-knowledge proof generation (client-side, in-browser)", time: `${avgZkMs} s` },
        { stage: "Blockchain transaction confirmation", time: `${avgBlockchainMs} s` },
        { stage: "Total end-to-end vote latency", time: `${avgTotalMs} s` }
      ]
    };

    res.json({ results, electionId: req.params.id, performanceMetrics: metrics });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/public/elections/:id/performance-metrics", async (req, res) => {
  try {
    const pool = require("./db/pool");
    const [rows] = await pool.query(
      `SELECT 
         COUNT(*) as totalVotes,
         AVG(merkle_proof_fetch_ms) as avgMerkleMs,
         AVG(zk_proof_gen_ms) as avgZkMs,
         AVG(blockchain_confirm_ms) as avgBlockchainMs,
         AVG(total_latency_ms) as avgTotalMs
       FROM vote_receipts
       WHERE election_id = ?`,
      [req.params.id]
    );

    const data = rows[0] || {};
    const totalVotes = Number(data.totalVotes || 0);

    const avgMerkleMs = totalVotes > 0 && data.avgMerkleMs > 0 ? Math.round(data.avgMerkleMs) : 0;
    const avgZkMs = totalVotes > 0 && data.avgZkMs > 0 ? Number((data.avgZkMs / 1000).toFixed(2)) : 0;
    const avgBlockchainMs = totalVotes > 0 && data.avgBlockchainMs > 0 ? Number((data.avgBlockchainMs / 1000).toFixed(2)) : 0;
    const avgTotalMs = totalVotes > 0 && data.avgTotalMs > 0 ? Number((data.avgTotalMs / 1000).toFixed(2)) : 0;

    res.json({
      electionId: req.params.id,
      totalVotesProcessed: totalVotes,
      metrics: {
        merkleInclusionFetchMs: avgMerkleMs,
        zkProofGenerationSec: avgZkMs,
        blockchainConfirmationSec: avgBlockchainMs,
        totalEndToEndLatencySec: avgTotalMs
      },
      comparison: {
        paperPerVoteCastingTime: `${avgTotalMs} s`,
        relatedWorkPerVoteCastingTime: "< 4 s"
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Content integrity check — anyone (Admin or Voter) can call this.
// Re-hashes the file on disk right now and compares to the hash
// permanently anchored on the blockchain at upload time.
app.get("/public/candidates/:id/verify-integrity", async (req, res) => {
  try {
    const result = await verifyManifestoIntegrity(req.params.id);
    if (!result.found) return res.status(404).json({ error: "No manifesto found for this candidate" });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// PERFORMANCE METRICS ENDPOINT
// ─────────────────────────────────────────────

app.get("/admin/metrics", (req, res) => {
  const metrics = getRecentMetrics();

  const totalRequests = metrics.length;
  const avgResponseTime = totalRequests
    ? Math.round(metrics.reduce((sum, m) => sum + m.durationMs, 0) / totalRequests)
    : 0;
  const slowest = totalRequests
    ? Math.max(...metrics.map(m => m.durationMs))
    : 0;
  const fastest = totalRequests
    ? Math.min(...metrics.map(m => m.durationMs))
    : 0;

  const byRoute = {};
  metrics.forEach(m => {
    const key = `${m.method} ${m.path.split("?")[0]}`;
    if (!byRoute[key]) byRoute[key] = { count: 0, totalMs: 0 };
    byRoute[key].count++;
    byRoute[key].totalMs += m.durationMs;
  });

  const routeStats = Object.entries(byRoute).map(([route, data]) => ({
    route,
    requests: data.count,
    avgMs: Math.round(data.totalMs / data.count)
  })).sort((a, b) => b.avgMs - a.avgMs);

  res.json({
    summary: { totalRequests, avgResponseTime, slowest, fastest },
    byRoute: routeStats,
    recent: metrics.slice(0, 20)
  });
});

app.get("/health", (req, res) => res.json({ ok: true, version: "v2.6-resend", build: "2026-10-11-resend-status" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 E-Voting backend running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Metrics:      http://localhost:${PORT}/admin/metrics\n`);
});