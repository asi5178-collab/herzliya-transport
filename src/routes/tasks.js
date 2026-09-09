const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const { status, category, stakeholder } = req.query;
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (stakeholder) { sql += ' AND stakeholder = ?'; params.push(stakeholder); }
  sql += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

// ניתוח ביצוע — סטטיסטיקות + הערות סגירה
router.get('/stats', (req, res) => {
  const db = getDb();
  const all    = db.prepare("SELECT COUNT(*) as c FROM tasks").get().c;
  const open   = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status != 'done'").get().c;
  const done   = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done'").get().c;
  const high   = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE priority='high' AND status!='done'").get().c;
  const overdue= db.prepare("SELECT COUNT(*) as c FROM tasks WHERE deadline < DATE('now') AND status!='done'").get().c;

  // הערות סגירה — לפי קטגוריה ובעל עניין
  const completed = db.prepare(`
    SELECT id, title, category, stakeholder, priority, completion_note, deadline, week_number,
           created_at
    FROM tasks WHERE status = 'done' AND completion_note IS NOT NULL AND completion_note != ''
    ORDER BY created_at DESC LIMIT 50
  `).all();

  // סיכום לפי בעל עניין
  const byStakeholder = db.prepare(`
    SELECT stakeholder,
           COUNT(*) as total,
           SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done_count,
           SUM(CASE WHEN status!='done' THEN 1 ELSE 0 END) as open_count
    FROM tasks WHERE stakeholder IS NOT NULL
    GROUP BY stakeholder ORDER BY total DESC
  `).all();

  // סיכום לפי קטגוריה
  const byCategory = db.prepare(`
    SELECT category,
           COUNT(*) as total,
           SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done_count
    FROM tasks WHERE category IS NOT NULL
    GROUP BY category
  `).all();

  res.json({ all, open, done, high, overdue, completed, byStakeholder, byCategory });
});

router.get('/stakeholders', (req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT stakeholder FROM tasks WHERE stakeholder IS NOT NULL ORDER BY stakeholder").all();
  res.json(rows.map(r => r.stakeholder));
});

router.post('/', requireRole('admin'), (req, res) => {
  const { title, description, priority, deadline, assignee, stakeholder, category, week_date, week_number } = req.body;
  if (!title) return res.status(400).json({ error: 'כותרת חובה' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO tasks (title, description, priority, deadline, assignee, stakeholder, category, week_date, week_number, source) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(title, description, priority || 'medium', deadline, assignee, stakeholder || 'מנהל הסעות', category || 'שיפור', week_date, week_number, 'manual');
  res.json({ id: result.lastInsertRowid, success: true });
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const { title, description, priority, status, deadline, assignee, stakeholder, category, completion_note } = req.body;
  const db = getDb();
  db.prepare('UPDATE tasks SET title=?, description=?, priority=?, status=?, deadline=?, assignee=?, stakeholder=?, category=?, completion_note=? WHERE id=?')
    .run(title, description, priority, status, deadline, assignee, stakeholder, category, completion_note || null, req.params.id);
  res.json({ success: true });
});

router.patch('/:id/status', requireRole('admin'), (req, res) => {
  const { status, completion_note } = req.body;
  const db = getDb();
  if (completion_note !== undefined) {
    db.prepare('UPDATE tasks SET status=?, completion_note=? WHERE id=?').run(status, completion_note || null, req.params.id);
  } else {
    db.prepare('UPDATE tasks SET status=? WHERE id=?').run(status, req.params.id);
  }
  res.json({ success: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
