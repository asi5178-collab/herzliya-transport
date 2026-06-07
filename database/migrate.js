'use strict';
// הוספת עמודות חדשות ל-tasks (אם לא קיימות)
const Database = require('./sqlite-compat');
const DB_PATH = process.env.DB_PATH || './database/herzliya.db';

const db = new Database(DB_PATH);

const migrations = [
  "ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT 'שיפור'",
  "ALTER TABLE tasks ADD COLUMN stakeholder TEXT DEFAULT 'מנהל הסעות'",
  "ALTER TABLE tasks ADD COLUMN week_number INTEGER"
];

for (const sql of migrations) {
  try { db.exec(sql); console.log('[OK]', sql.split(' ').slice(0,5).join(' ')); }
  catch { /* עמודה כבר קיימת */ }
}

db.close();
console.log('[OK] Migration done');
