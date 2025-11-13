// src/db/init-db.js
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/pandaura.sqlite3');
const db = new Database(dbPath);

const stmts = [
`CREATE TABLE IF NOT EXISTS logic_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  vendor TEXT DEFAULT 'neutral',
  last_modified TEXT,
  author TEXT
);`,
`CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  value TEXT,
  persist INTEGER DEFAULT 1,
  source TEXT DEFAULT 'shadow',
  metadata TEXT
);`,
`CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  timestamp TEXT,
  payload TEXT
);`
];

for (const s of stmts) db.exec(s);
console.log('DB initialized at', dbPath);
db.close();
