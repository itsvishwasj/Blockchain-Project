const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '../db/evoting.sqlite');
const snapshotPath = path.join(__dirname, '../db/database_snapshot.json');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Update candidate 3, 4, 5
  db.run("UPDATE attested_content SET storage_uri = 'uploads/manifesto_8_1791729598012.txt' WHERE candidate_id = 3 AND storage_uri = 'inline'");
  db.run("UPDATE attested_content SET storage_uri = 'uploads/manifesto_9_1791729598032.txt' WHERE candidate_id = 4 AND storage_uri = 'inline'");
  db.run("UPDATE attested_content SET storage_uri = 'uploads/manifesto_10_1791729598056.txt' WHERE candidate_id = 5 AND storage_uri = 'inline'");

  // Also restore any missing candidates from snapshot if table was empty
  if (fs.existsSync(snapshotPath)) {
    try {
      const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      if (Array.isArray(snap.candidates) && snap.candidates.length > 0) {
        db.get("SELECT COUNT(*) as count FROM candidates", (err, row) => {
          if (!err && row && row.count === 0) {
            console.log("Restoring candidates from snapshot...");
            for (const c of snap.candidates) {
              const keys = Object.keys(c);
              const vals = Object.values(c);
              const placeholders = keys.map(() => "?").join(", ");
              db.run(`INSERT OR IGNORE INTO candidates (${keys.join(", ")}) VALUES (${placeholders})`, vals);
            }
          }
        });
      }
    } catch (e) {
      console.warn("Snapshot restore notice:", e.message);
    }
  }
  
  db.all('SELECT * FROM attested_content', (err, rows) => {
    console.log('Updated SQLite attested_content count:', rows ? rows.length : 0);
    console.table(rows);
    db.close();
  });
});

if (fs.existsSync(snapshotPath)) {
  const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (data.attested_content) {
    data.attested_content.forEach(ac => {
      if (ac.candidate_id === 3 && ac.storage_uri === 'inline') ac.storage_uri = 'uploads/manifesto_8_1791729598012.txt';
      if (ac.candidate_id === 4 && ac.storage_uri === 'inline') ac.storage_uri = 'uploads/manifesto_9_1791729598032.txt';
      if (ac.candidate_id === 5 && ac.storage_uri === 'inline') ac.storage_uri = 'uploads/manifesto_10_1791729598056.txt';
    });
    fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('Updated database_snapshot.json successfully');
  }
}
