'use strict';
// Compatibility wrapper: mimics better-sqlite3 API using built-in node:sqlite (Node.js 24+)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

function toNum(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) {
    out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
  }
  return out;
}

class Statement {
  constructor(stmt) { this._s = stmt; }
  run(...args) { return this._s.run(...args); }
  get(...args) { return toNum(this._s.get(...args)); }
  all(...args) { return (this._s.all(...args) || []).map(toNum); }
}

class Database {
  constructor(dbPath) {
    const resolved = path.resolve(dbPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this._db = new DatabaseSync(resolved);
    this._db.exec('PRAGMA journal_mode = WAL');
    this._db.exec('PRAGMA foreign_keys = ON');
  }

  pragma(str) {
    try { this._db.exec(`PRAGMA ${str}`); } catch {}
    return this;
  }

  prepare(sql) { return new Statement(this._db.prepare(sql)); }

  exec(sql) { return this._db.exec(sql); }

  transaction(fn) {
    const db = this._db;
    return function (...args) {
      db.exec('BEGIN');
      try {
        const r = fn(...args);
        db.exec('COMMIT');
        return r;
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch {}
        throw e;
      }
    };
  }

  close() { try { this._db.close(); } catch {} }
}

module.exports = Database;
