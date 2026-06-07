const Database = require('./sqlite-compat');
const path = require('path');

let db = null;

function getDb() {
  if (!db) {
    const dbPath = process.env.DB_PATH || './database/herzliya.db';
    db = new Database(path.resolve(dbPath));
  }
  return db;
}

module.exports = { getDb };
