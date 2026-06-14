'use strict';
// Compatibility wrapper using better-sqlite3
const BetterSQLite = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class Database {
  constructor(dbPath) {
    const resolved = path.resolve(dbPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this._db = new BetterSQLite(resolved);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('foreign_keys = ON');
  }

  pragma(str) {
    try { this._db.pragma(str); } catch {}
    return this;
  }

  prepare(sql) { return this._db.prepare(sql); }

  exec(sql) { return this._db.exec(sql); }

  transaction(fn) { return this._db.transaction(fn); }

  close() { try { this._db.close(); } catch {} }
}

module.exports = Database;
