/**
 * OpenEduGrid Campus Edge Node & SQLite Ledger
 * Developed by THE S.O. GROUP
 * Author: Onovroke Goodnews Ovie
 * 
 * Ingests offline student queues, verifies SHA-256 integrity checksums,
 * and records submissions into a local SQLite database.
 */

const express = require('express');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Initialize Local SQLite Database for the Department
const dbPath = path.resolve(__dirname, 'openedugrid_edge.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[Edge Database] Failed to open SQLite connection:', err.message);
  } else {
    console.log('[Edge Database] Connected to local SQLite storage successfully.');
  }
});

// Create Submissions Table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_id TEXT,
    action_type TEXT,
    payload TEXT,
    timestamp TEXT,
    hash TEXT,
    verified_at TEXT
  )
`);

// Ingest endpoint for offline queue flush
app.post('/api/sync/queue', (req, res) => {
  const { id, actionType, payload, timestamp, hash } = req.body;
  const clientSignature = req.headers['x-openedugrid-signature'];

  if (clientSignature !== 'S.O.GROUP-VERIFIED') {
    return res.status(401).json({ status: 'ERROR', message: 'Invalid cryptographic signature badge.' });
  }

  // Verify SHA-256 checksum integrity
  const computedHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ actionType, payload, timestamp }))
    .digest('hex');

  if (computedHash !== hash) {
    console.warn(`[Edge Gateway] Checksum failed for queue ID #${id}`);
    return res.status(400).json({ status: 'FAILED', message: 'Checksum validation failed.' });
  }

  const verifiedAt = new Date().toISOString();

  // Insert into SQLite Database
  const query = `INSERT INTO submissions (queue_id, action_type, payload, timestamp, hash, verified_at) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(query, [id, actionType, JSON.stringify(payload), timestamp, hash, verifiedAt], function(err) {
    if (err) {
      console.error('[Edge Database] Insert error:', err.message);
      return res.status(500).json({ status: 'ERROR', message: 'Database write failed.' });
    }

    console.log(`[Edge Database] Committed & verified submission #${this.lastID} (Queue ID: #${id})`);
    return res.status(200).json({ status: 'SUCCESS', committedId: id, dbRecordId: this.lastID });
  });
});

// Endpoint to view all verified local ledger records
app.get('/api/ledger', (req, res) => {
  db.all(`SELECT * FROM submissions ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ totalRecords: rows.length, ledger: rows });
  });
});

app.listen(PORT, () => {
  console.log(`[OpenEduGrid Edge Node] Gateway & SQLite running on port ${PORT} under THE S.O. GROUP framework.`);
});