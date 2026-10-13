const pool = require("../db/pool");

async function inspectDatabase() {
  const targetTable = process.argv[2];

  const tables = [
    "users",
    "elections",
    "candidates",
    "voter_rolls",
    "voters",
    "vote_receipts",
    "attested_content",
    "election_voter_participations",
    "otp_verifications"
  ];

  try {
    // Wait slightly for pool initialization
    await new Promise(r => setTimeout(r, 400));

    if (targetTable) {
      if (!tables.includes(targetTable)) {
        console.log(`Unknown table: ${targetTable}`);
        console.log(`Available tables: ${tables.join(", ")}`);
        process.exit(1);
      }

      const [rows] = await pool.query(`SELECT * FROM ${targetTable}`);
      console.log(`\n======================================================`);
      console.log(`📋 TABLE: ${targetTable.toUpperCase()} (${rows.length} records)`);
      console.log(`======================================================`);
      if (rows.length === 0) {
        console.log("(Table is empty)");
      } else {
        console.table(rows);
      }
      process.exit(0);
    }

    console.log("\n======================================================");
    console.log("📊 DATABASE SUMMARY & RECORD COUNTS");
    console.log("======================================================");

    for (const t of tables) {
      try {
        const [rows] = await pool.query(`SELECT * FROM ${t}`);
        console.log(`\n▶ Table: ${t.padEnd(30)} [${rows.length} rows]`);
        if (rows.length > 0) {
          // Display up to 5 rows in console.table
          const sample = rows.slice(0, 5);
          console.table(sample);
          if (rows.length > 5) {
            console.log(`  ... and ${rows.length - 5} more rows. Run 'node backend/scripts/inspect_db.js ${t}' to view all.`);
          }
        } else {
          console.log("  (empty)");
        }
      } catch (err) {
        console.log(`  Error querying ${t}: ${err.message}`);
      }
    }

    console.log("\n💡 Tip: To view a specific table in full, run:");
    console.log("   node backend/scripts/inspect_db.js <table_name>");
    console.log("   Example: node backend/scripts/inspect_db.js elections\n");

    process.exit(0);
  } catch (err) {
    console.error("Database query failed:", err.message);
    process.exit(1);
  }
}

inspectDatabase();
