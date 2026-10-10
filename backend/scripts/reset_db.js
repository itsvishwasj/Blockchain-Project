const pool = require("../db/pool");
const bcrypt = require("bcryptjs");

async function resetDatabase() {
  console.log("🧹 Wiping all test data from database...");
  try {
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
    } catch (e) {
      // Ignore if MySQL or sequence table missing
    }

    // Seed default admin account
    const passwordHash = await bcrypt.hash("admin123", 10);
    await pool.query(
      `INSERT INTO users (id, role, email, password_hash, phone_verified)
       VALUES (1, 'ADMIN', 'admin@voting.com', ?, 1)`,
      [passwordHash]
    );

    console.log("✅ Database wiped cleanly!");
    console.log("🔑 Default admin seeded: admin@voting.com / admin123 (ID 1)");
    process.exit(0);
  } catch (err) {
    console.error("❌ Reset failed:", err.message);
    process.exit(1);
  }
}

resetDatabase();
