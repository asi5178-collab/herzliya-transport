'use strict';
const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(auth);

const TABLES = [
  'users', 'schools', 'zones', 'lines', 'parent_groups', 'students',
  'weekly_ridership', 'weekly_analysis', 'whatsapp_messages',
  'tasks', 'reports', 'student_analysis', 'import_log'
];

// ייצוא מלא — כל הטבלאות לקובץ JSON
router.get('/export', requireRole('admin'), (req, res) => {
  const db = getDb();
  const backup = {
    exported_at: new Date().toISOString(),
    version: '1.0',
    app: 'herzliya-transport',
    tables: {}
  };
  for (const t of TABLES) {
    try   { backup.tables[t] = db.prepare(`SELECT * FROM ${t}`).all(); }
    catch { backup.tables[t] = []; }
  }
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="herzliya-backup-${date}.json"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(backup);
});

// שחזור — קבל JSON ושחזר את כל הנתונים
router.post('/import', requireRole('admin'), (req, res) => {
  const { tables } = req.body;
  if (!tables || typeof tables !== 'object') {
    return res.status(400).json({ error: 'פורמט גיבוי לא תקין' });
  }

  const db = getDb();
  const results = {};
  let totalRows = 0;

  // כיבוי FK זמני כדי למנוע בעיות סדר ייבוא
  try { db.exec('PRAGMA foreign_keys = OFF'); } catch {}

  try {
    db.transaction(() => {
      for (const tableName of TABLES) {
        const rows = tables[tableName];
        if (!Array.isArray(rows) || rows.length === 0) { results[tableName] = 0; continue; }

        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(() => '?').join(',');
        const sql = `INSERT OR REPLACE INTO ${tableName} (${cols.join(',')}) VALUES (${placeholders})`;

        try {
          const stmt = db.prepare(sql);
          let count = 0;
          for (const row of rows) {
            stmt.run(...cols.map(c => row[c] !== undefined ? row[c] : null));
            count++;
          }
          results[tableName] = count;
          totalRows += count;
        } catch (e) {
          console.error(`[backup] import error in ${tableName}:`, e.message);
          results[tableName] = `שגיאה: ${e.message}`;
        }
      }
    })();

    res.json({ success: true, total_rows: totalRows, results });
  } catch (e) {
    console.error('[backup] transaction error:', e.message);
    res.status(500).json({ error: `שגיאת שחזור: ${e.message}` });
  } finally {
    try { db.exec('PRAGMA foreign_keys = ON'); } catch {}
  }
});

// סטטוס — כמה שורות יש בכל טבלה
router.get('/status', requireRole('admin'), (req, res) => {
  const db = getDb();
  const counts = {};
  for (const t of TABLES) {
    try   { counts[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c; }
    catch { counts[t] = 0; }
  }
  res.json(counts);
});

module.exports = router;
