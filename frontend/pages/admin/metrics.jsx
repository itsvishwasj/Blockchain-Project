import { useState, useEffect } from "react";
import api from "../../lib/api";

export default function MetricsPage() {
  const [metrics, setMetrics] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadMetrics();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadMetrics, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  async function loadMetrics() {
    try {
      const { data } = await api.get("/admin/metrics");
      setMetrics(data);
    } catch (err) {
      console.error("Could not load metrics:", err.message);
    }
  }

  if (!metrics)
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Loading metrics...</p>
      </div>
    );

  const { summary, byRoute, recent } = metrics;

  function speedColor(ms) {
    if (ms < 100) return "#34d399";
    if (ms < 500) return "#fbbf24";
    return "#f87171";
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
          <h1 className="text-2xl font-bold text-white mb-2">System Performance</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400 mb-6">
            <span>Real-time API response times and system health.</span>
            <label className="flex items-center gap-1.5 text-slate-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="accent-cyan-400"
              />
              Auto-refresh every 3 seconds
            </label>
            <button
              onClick={loadMetrics}
              className="bg-slate-800 border border-slate-700 text-white text-xs font-medium rounded-lg px-3 py-1.5 hover:bg-slate-700 transition-colors"
            >
              Refresh Now
            </button>
          </div>

          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: "Total Requests", value: summary.totalRequests },
              { label: "Avg Response", value: `${summary.avgResponseTime}ms` },
              { label: "Fastest", value: `${summary.fastest}ms` },
              { label: "Slowest", value: `${summary.slowest}ms` }
            ].map(card => (
              <div
                key={card.label}
                className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-center"
              >
                <div className="text-2xl font-bold text-white">{card.value}</div>
                <div className="text-xs text-slate-400 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {/* PER ROUTE AVERAGES */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3">Response Time by Endpoint</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800">
                  <th className="p-2 text-left text-slate-400 font-medium">Endpoint</th>
                  <th className="p-2 text-right text-slate-400 font-medium">Requests</th>
                  <th className="p-2 text-right text-slate-400 font-medium">Avg Time</th>
                  <th className="p-2 text-slate-400 font-medium">Speed</th>
                </tr>
              </thead>
              <tbody>
                {byRoute.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800">
                    <td className="p-2 font-mono text-xs text-slate-300">{r.route}</td>
                    <td className="p-2 text-right text-slate-300">{r.requests}</td>
                    <td
                      className="p-2 text-right font-bold"
                      style={{ color: speedColor(r.avgMs) }}
                    >
                      {r.avgMs}ms
                    </td>
                    <td className="p-2">
                      <div className="h-2 rounded bg-slate-800">
                        <div
                          className="h-2 rounded"
                          style={{
                            background: speedColor(r.avgMs),
                            width: `${Math.min(100, (r.avgMs / 2000) * 100)}%`
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* RECENT REQUESTS */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Recent Requests (last 20)</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800">
                  <th className="p-1.5 text-left text-slate-400 font-medium">Time</th>
                  <th className="p-1.5 text-left text-slate-400 font-medium">Method</th>
                  <th className="p-1.5 text-left text-slate-400 font-medium">Path</th>
                  <th className="p-1.5 text-right text-slate-400 font-medium">Status</th>
                  <th className="p-1.5 text-right text-slate-400 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800">
                    <td className="p-1.5 text-slate-500">{r.time}</td>
                    <td className="p-1.5 text-slate-300">{r.method}</td>
                    <td className="p-1.5 font-mono text-slate-400">
                      {r.path.length > 50 ? r.path.slice(0, 50) + "..." : r.path}
                    </td>
                    <td
                      className="p-1.5 text-right font-medium"
                      style={{ color: r.status < 400 ? "#34d399" : "#f87171" }}
                    >
                      {r.status}
                    </td>
                    <td
                      className="p-1.5 text-right font-bold"
                      style={{ color: speedColor(r.durationMs) }}
                    >
                      {r.durationMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 text-xs text-slate-500 space-y-2">
            <p>
              Color guide:{" "}
              <span style={{ color: "#34d399" }}>Green = under 100ms (fast)</span> |{" "}
              <span style={{ color: "#fbbf24" }}>Orange = 100-500ms (normal)</span> |{" "}
              <span style={{ color: "#f87171" }}>Red = over 500ms (slow)</span>
            </p>
            <p>
              Note: ZK proof generation happens in the voter's browser, not on this server —
              so its time (typically 2-8 seconds) does not appear here. It is shown
              directly to the voter on the voting page.
            </p>
          </div>

          <p className="mt-4 text-sm">
            <a href="/admin/dashboard" className="text-cyan-400 hover:underline">
              ← Back to dashboard
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}