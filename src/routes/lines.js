const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const lines = db.prepare(`
    SELECT l.*, COUNT(s.id) as student_count
    FROM lines l LEFT JOIN students s ON s.line_id = l.id AND s.is_active = 1
    GROUP BY l.id ORDER BY l.code
  `).all();

  const result = lines.map(l => ({
    ...l,
    waypoints: JSON.parse(l.waypoints || '[]'),
    zone_ids: JSON.parse(l.zone_ids || '[]')
  }));
  res.json(result);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const line = db.prepare('SELECT * FROM lines WHERE id = ?').get(req.params.id);
  if (!line) return res.status(404).json({ error: 'קו לא נמצא' });

  const students = db.prepare(`
    SELECT s.*, z.name as zone_name FROM students s
    LEFT JOIN zones z ON s.zone_id = z.id WHERE s.line_id = ? AND s.is_active = 1
  `).all(req.params.id);

  res.json({
    ...line,
    waypoints: JSON.parse(line.waypoints || '[]'),
    zone_ids: JSON.parse(line.zone_ids || '[]'),
    students
  });
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const { name, description, capacity, vehicle_type, waypoints, zone_ids, status } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE lines SET name=?, description=?, capacity=?, vehicle_type=?, waypoints=?, zone_ids=?, status=?
    WHERE id=?
  `).run(name, description, capacity, vehicle_type,
    JSON.stringify(waypoints || []), JSON.stringify(zone_ids || []), status, req.params.id);
  res.json({ success: true });
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name, code, description, capacity, vehicle_type, waypoints, zone_ids, status } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'שם וקוד קו חובה' });

  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO lines (name, code, description, capacity, vehicle_type, waypoints, zone_ids, status)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(name, code, description, capacity || 18, vehicle_type || 'minibus',
      JSON.stringify(waypoints || []), JSON.stringify(zone_ids || []), status || 'active');
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'קוד קו כבר קיים' });
    res.status(500).json({ error: 'שגיאה ביצירת קו' });
  }
});

module.exports = router;
