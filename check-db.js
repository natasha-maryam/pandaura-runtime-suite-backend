const sqlite3 = require('better-sqlite3');
const db = new sqlite3('./data/pandaura-dev.sqlite3');

console.log('\n=== Database Tables ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log('-', t.name));

console.log('\n=== Versions Table Columns ===');
try {
  const columns = db.prepare("PRAGMA table_info(versions)").all();
  if (columns.length > 0) {
    columns.forEach(col => console.log(`- ${col.name} (${col.type})`));
  } else {
    console.log('Table does not exist!');
  }
} catch (err) {
  console.error('Error:', err.message);
}

db.close();
