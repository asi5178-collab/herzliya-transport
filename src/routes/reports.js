const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const reports = db.prepare(`
    SELECT r.id, r.week_date, r.title, r.created_at, u.full_name as created_by_name
    FROM reports r LEFT JOIN users u ON r.created_by = u.id
    ORDER BY r.week_date DESC
  `).all();
  res.json(reports);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'דוח לא נמצא' });
  res.json(report);
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const { title, content_hebrew } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT id FROM reports WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'דוח לא נמצא' });
  db.prepare('UPDATE reports SET title=?, content_hebrew=? WHERE id=?')
    .run(title, content_hebrew, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
