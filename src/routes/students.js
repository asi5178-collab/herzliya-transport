const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const { zone_id, line_id, school_id, search } = req.query;

  let sql = `
    SELECT s.*, sc.name as school_name, z.name as zone_name, l.name as line_name, l.code as line_code
    FROM students s
    LEFT JOIN schools sc ON s.school_id = sc.id
    LEFT JOIN zones z ON s.zone_id = z.id
    LEFT JOIN lines l ON s.line_id = l.id
    WHERE s.is_active = 1
  `;
  const params = [];

  if (zone_id) { sql += ' AND s.zone_id = ?'; params.push(zone_id); }
  if (line_id) { sql += ' AND s.line_id = ?'; params.push(line_id); }
  if (school_id) { sql += ' AND s.school_id = ?'; params.push(school_id); }
  if (search) { sql += ' AND (s.name LIKE ? OR s.address LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  sql += ' ORDER BY s.name';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name, school_id, zone_id, line_id, address, latitude, longitude, parent_name, parent_phone, has_app, whatsapp_phone } = req.body;
  if (!name) return res.status(400).json({ error: 'שם תלמיד חובה' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO students (name, school_id, zone_id, line_id, address, latitude, longitude, parent_name, parent_phone, has_app, whatsapp_phone)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(name, school_id, zone_id, line_id, address, latitude, longitude, parent_name, parent_phone, has_app ? 1 : 0, whatsapp_phone || null);

  res.json({ id: result.lastInsertRowid, success: true });
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const { name, school_id, zone_id, line_id, address, latitude, longitude, parent_name, parent_phone, has_app, whatsapp_phone } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE students SET name=?, school_id=?, zone_id=?, line_id=?, address=?, latitude=?, longitude=?,
    parent_name=?, parent_phone=?, has_app=?, whatsapp_phone=? WHERE id=?
  `).run(name, school_id, zone_id, line_id, address, latitude, longitude, parent_name, parent_phone, has_app ? 1 : 0, whatsapp_phone || null, req.params.id);
  res.json({ success: true });
});

// קבלת תלמידים עם WhatsApp
router.get('/with-whatsapp', (req, res) => {
  const db = getDb();
  const { line_id } = req.query;
  let sql = `
    SELECT s.id, s.name, s.whatsapp_phone, s.line_id, l.name as line_name, l.code as line_code,
           sc.name as school_name, z.name as zone_name
    FROM students s
    LEFT JOIN lines l ON s.line_id = l.id
    LEFT JOIN schools sc ON s.school_id = sc.id
    LEFT JOIN zones z ON s.zone_id = z.id
    WHERE s.is_active = 1 AND s.whatsapp_phone IS NOT NULL AND s.whatsapp_phone != ''
  `;
  const params = [];
  if (line_id) { sql += ' AND s.line_id = ?'; params.push(line_id); }
  sql += ' ORDER BY s.name';
  res.json(db.prepare(sql).all(...params));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE students SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/stats', (req, res) => {
  const db = getDb();
  const byZone = db.prepare(`
    SELECT z.name, z.code, z.color, COUNT(s.id) as count
    FROM zones z LEFT JOIN students s ON s.zone_id = z.id AND s.is_active = 1
    GROUP BY z.id ORDER BY count DESC
  `).all();

  const bySchool = db.prepare(`
    SELECT sc.name, COUNT(s.id) as count
    FROM schools sc LEFT JOIN students s ON s.school_id = sc.id AND s.is_active = 1
    GROUP BY sc.id ORDER BY count DESC
  `).all();

  const byLine = db.prepare(`
    SELECT l.name, l.code, COUNT(s.id) as count
    FROM lines l LEFT JOIN students s ON s.line_id = l.id AND s.is_active = 1
    GROUP BY l.id ORDER BY count DESC
  `).all();

  const withApp = db.prepare('SELECT COUNT(*) as c FROM students WHERE has_app = 1 AND is_active = 1').get().c;
  const total = db.prepare('SELECT COUNT(*) as c FROM students WHERE is_active = 1').get().c;

  res.json({ by_zone: byZone, by_school: bySchool, by_line: byLine, with_app: withApp, total });
});

module.exports = router;
