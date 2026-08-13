/**
 * Performance measurement middleware
 * Tracks response time for every API request
 * Results stored in MySQL and visible on admin dashboard
 */

const pool = require("../db/pool");

// Simple in-memory store for recent measurements
// (shown on dashboard without needing a DB query every time)
const recentMetrics = [];
const MAX_RECENT = 100;

function recordMetric(data) {
  recentMetrics.unshift(data);
  if (recentMetrics.length > MAX_RECENT) recentMetrics.pop();
}

// Middleware that times every request
function performanceMiddleware(req, res, next) {
  const start = Date.now();
  const time = new Date().toLocaleTimeString();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const metric = {
      time,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration
    };

    // Only log meaningful routes, not health checks
    if (!req.originalUrl.includes("/health")) {
      console.log(`[${time}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
      recordMetric(metric);
    }
  });

  next();
}

function getRecentMetrics() {
  return recentMetrics;
}

module.exports = { performanceMiddleware, getRecentMetrics };
