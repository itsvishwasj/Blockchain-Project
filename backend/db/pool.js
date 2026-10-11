const mysql = require("mysql2/promise");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
require("dotenv").config();

let useSqlite = false;
let sqliteDb = null;
let mysqlPool = null;

// Initialize SQLite database fallback
const sqlitePath = path.join(__dirname, "evoting.sqlite");

function initSqlite() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(sqlitePath, (err) => {
      if (err) return reject(err);
      console.log(`📦 DB fallback active: Using SQLite database at ${sqlitePath}`);
      sqliteDb = db;
      useSqlite = true;

      // Enable foreign keys and busy timeout
      db.run("PRAGMA foreign_keys = ON;");
      db.run("PRAGMA busy_timeout = 5000;");

      // Create tables in SQLite
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          voter_id TEXT NULL,
          phone_number TEXT NULL,
          phone_verified INTEGER DEFAULT 0,
          wallet_address TEXT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS otp_verifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NULL,
          email TEXT NULL,
          otp_code TEXT NOT NULL,
          purpose TEXT NULL,
          expires_at DATETIME NOT NULL,
          used INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS elections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          merkle_root TEXT DEFAULT '0x0',
          contract_address TEXT DEFAULT '0x0',
          start_time DATETIME NOT NULL,
          end_time DATETIME NOT NULL,
          status TEXT DEFAULT 'DRAFT',
          created_by INTEGER NOT NULL
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS voter_rolls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          election_id INTEGER NOT NULL,
          voter_id TEXT NOT NULL,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL,
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(election_id, voter_id)
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS voters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL UNIQUE,
          election_id INTEGER NOT NULL,
          identity_commitment TEXT NOT NULL,
          merkle_leaf_index INTEGER NULL,
          is_verified INTEGER DEFAULT 1,
          registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(election_id, identity_commitment)
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS candidates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          election_id INTEGER NOT NULL,
          display_name TEXT NOT NULL,
          bio TEXT,
          public_key TEXT NOT NULL,
          stance_vector TEXT NULL,
          stance_tx_hash TEXT NULL,
          manifesto_tx_hash TEXT NULL,
          status TEXT DEFAULT 'PENDING',
          rejection_reason TEXT NULL,
          UNIQUE(user_id, election_id)
        );`);

        // Migration check for rejection_reason
        db.run(`ALTER TABLE candidates ADD COLUMN rejection_reason TEXT NULL;`, (err) => {
          // Ignore error if column already exists
        });

        db.run(`CREATE TABLE IF NOT EXISTS attested_content (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          candidate_id INTEGER NOT NULL,
          content_type TEXT NOT NULL,
          storage_uri TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          signature TEXT NOT NULL,
          onchain_tx_hash TEXT NOT NULL,
          attested_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS vote_receipts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          election_id INTEGER NOT NULL,
          candidate_id INTEGER NULL,
          nullifier_hash TEXT NOT NULL,
          tx_hash TEXT NOT NULL,
          block_number INTEGER NOT NULL,
          merkle_proof_fetch_ms INTEGER DEFAULT 0,
          zk_proof_gen_ms INTEGER DEFAULT 0,
          blockchain_confirm_ms INTEGER DEFAULT 0,
          total_latency_ms INTEGER DEFAULT 0,
          cast_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(election_id, nullifier_hash)
        );`);

        db.run(`ALTER TABLE vote_receipts ADD COLUMN candidate_id INTEGER NULL;`, (err) => {
          // Ignore error if column already exists
        });

        db.run(`CREATE TABLE IF NOT EXISTS voter_preferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          voter_id INTEGER NOT NULL,
          election_id INTEGER NOT NULL,
          survey_answers TEXT NOT NULL,
          matched_results TEXT NOT NULL,
          generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(voter_id, election_id)
        );`, (schemaErr) => {
          if (schemaErr) console.error("SQLite Schema Error:", schemaErr);
          resolve();
        });
      });
    });
  });
}

// Check MySQL availability synchronously on startup
async function setupPool() {
  if (process.env.DB_USER && process.env.DB_PASSWORD) {
    try {
      mysqlPool = mysql.createPool({
        host: process.env.DB_HOST || "127.0.0.1",
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || "evoting",
        waitForConnections: true,
        connectionLimit: 10,
        connectTimeout: 2000
      });
      const conn = await mysqlPool.getConnection();
      conn.release();
      console.log("✅ DB connected: Using local MySQL instance");
      return;
    } catch (err) {
      console.log(`⚠️ MySQL connection unavailable (${err.message}). Switching to SQLite fallback...`);
    }
  }
  await initSqlite();
}

const poolPromise = setupPool();

module.exports = {
  async query(sql, params = []) {
    await poolPromise;

    if (!useSqlite && mysqlPool) {
      return mysqlPool.query(sql, params);
    }

    return new Promise((resolve, reject) => {
      // Transform MySQL SQL syntax quirks to SQLite syntax
      let cleanSql = sql
        .replace(/ON DUPLICATE KEY UPDATE[\s\S]*/i, (match) => {
          // Simplification for INSERT ON CONFLICT DO UPDATE
          const updates = match.replace(/ON DUPLICATE KEY UPDATE/i, "").trim();
          return `ON CONFLICT DO UPDATE SET ${updates}`;
        })
        .replace(/VALUES\((\w+)\)/g, "EXCLUDED.$1")
        .replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP")
        .replace(/TRUE/gi, "1")
        .replace(/FALSE/gi, "0");

      const isSelect = /^\s*SELECT/i.test(cleanSql);

      if (isSelect) {
        sqliteDb.all(cleanSql, params, (err, rows) => {
          if (err) return reject(err);
          resolve([rows, []]);
        });
      } else {
        sqliteDb.run(cleanSql, params, function (err) {
          if (err) return reject(err);
          resolve([{ insertId: this.lastID, affectedRows: this.changes }, []]);
        });
      }
    });
  }
};