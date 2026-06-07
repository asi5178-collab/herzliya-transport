require('dotenv').config();
const Database = require('./sqlite-compat');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './database/herzliya.db';

function initDatabase() {
  console.log('[*] Initializing database...');
  const db = new Database(DB_PATH);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  console.log('[OK] Schema created');
  db.close();
  return true;
}

module.exports = { initDatabase };

if (require.main === module) {
  initDatabase();
  console.log('[OK] Database ready');
}
