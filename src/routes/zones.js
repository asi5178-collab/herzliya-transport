const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const zones = db.prepare(`
    SELECT z.*, COUNT(s.id) as student_count
    FROM zones z LEFT JOIN students s ON s.zone_id = z.id AND s.is_active = 1
    GROUP BY z.id ORDER BY z.name
  `).all();
  res.json(zones);
});

router.post('/', requireRole('admin', 'manager'), (req, res) => {
  const { name, code, latitude, longitude, color, description } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'שם וקוד אזור חובה' });

  const db = getDb();
  try {
    const result = db.prepare(
      'INSERT INTO zones (name, code, latitude, longitude, color, description) VALUES (?,?,?,?,?,?)'
    ).run(name, code.toUpperCase(), latitude, longitude, color || '#3B82F6', description);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'קוד אזור כבר קיים' });
    res.status(500).json({ error: 'שגיאה ביצירת אזור' });
  }
});

router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  const { name, color, description, latitude, longitude, is_active } = req.body;
  const db = getDb();
  db.prepare(
    'UPDATE zones SET name=?, color=?, description=?, latitude=?, longitude=?, is_active=? WHERE id=?'
  ).run(name, color, description, latitude, longitude, is_active, req.params.id);
  res.json({ success: true });
});

router.get('/:id/students', (req, res) => {
  const db = getDb();
  const students = db.prepare(`
    SELECT s.*, sc.name as school_name, l.name as line_name
    FROM students s
    LEFT JOIN schools sc ON s.school_id = sc.id
    LEFT JOIN lines l ON s.line_id = l.id
    WHERE s.zone_id = ? AND s.is_active = 1
    ORDER BY s.name
  `).all(req.params.id);
  res.json(students);
});

module.exports = router;
