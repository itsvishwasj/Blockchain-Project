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

// Serve uploaded manifesto PDFs so they can be viewed in a new browser tab
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/voter", voterRoutes);
app.use("/candidate", candidateRoutes);

// ─────────────────────────────────────────────
// PUBLIC ENDPOINTS (no login needed)
// ─────────────────────────────────────────────

app.get("/public/elections/:id/candidates", async (req, res) => {
  try {
    const pool = require("./db/pool");
    const [rows] = await pool.query(
      `SELECT c.id, c.display_name, c.bio, c.stance_vector,
              c.stance_tx_hash, c.manifesto_tx_hash,
              (SELECT storage_uri FROM attested_content ac
                 WHERE ac.candidate_id = c.id AND ac.content_type = 'MANIFESTO'
                 ORDER BY ac.attested_at DESC LIMIT 1) AS manifesto_uri
       FROM candidates c
       WHERE c.election_id = ? AND c.status = 'APPROVED'
       ORDER BY c.id`,
      [req.params.id]
    );
    res.json({ candidates: rows });
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
    const ended = now > new Date(rows[0].end_time);
    if (!ended) {
      return res.status(403).json({ error: "Results not available until election closes" });
    }

    const [candidates] = await pool.query(
      "SELECT id, display_name FROM candidates WHERE election_id = ? AND status = 'APPROVED' ORDER BY id",
      [req.params.id]
    );
    const results = [];
    for (let i = 0; i < candidates.length; i++) {
      const count = await chain.getTally(req.params.id, i);
      results.push({
        candidateId: candidates[i].id,
        name: candidates[i].display_name,
        votes: Number(count)
      });
    }
    results.sort((a, b) => b.votes - a.votes);
    res.json({ results, electionId: req.params.id });
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

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 E-Voting backend running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Metrics:      http://localhost:${PORT}/admin/metrics\n`);
});