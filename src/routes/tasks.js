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

router.get('/stakeholders', (req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT stakeholder FROM tasks WHERE stakeholder IS NOT NULL ORDER BY stakeholder").all();
  res.json(rows.map(r => r.stakeholder));
});

router.post('/', requireRole('admin', 'manager'), (req, res) => {
  const { title, description, priority, deadline, assignee, stakeholder, category, week_date, week_number } = req.body;
  if (!title) return res.status(400).json({ error: 'כותרת חובה' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO tasks (title, description, priority, deadline, assignee, stakeholder, category, week_date, week_number, source) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(title, description, priority || 'medium', deadline, assignee, stakeholder || 'מנהל הסעות', category || 'שיפור', week_date, week_number, 'manual');
  res.json({ id: result.lastInsertRowid, success: true });
});

router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  const { title, description, priority, status, deadline, assignee, stakeholder, category } = req.body;
  const db = getDb();
  db.prepare('UPDATE tasks SET title=?, description=?, priority=?, status=?, deadline=?, assignee=?, stakeholder=?, category=? WHERE id=?')
    .run(title, description, priority, status, deadline, assignee, stakeholder, category, req.params.id);
  res.json({ success: true });
});

router.patch('/:id/status', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
