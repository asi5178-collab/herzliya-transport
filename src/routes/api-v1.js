'use strict';
/**
 * External API v1 — for transportation management software (SchoolRide integration)
 * Auth: X-API-Key header (set EXTERNAL_API_KEY env var)
 */

const express = require('express');
const { getDb } = require('../../database/db');

const router = express.Router();

// API key middleware
function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected) return res.status(503).json({ error: 'External API not configured (EXTERNAL_API_KEY not set)' });
  if (!key || key !== expected) return res.status(401).json({ error: 'Invalid or missing API key' });
  next();
}

router.use(apiKeyAuth);

// GET /api/v1/health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0', service: 'herzliya-transport' });
});

// GET /api/v1/lines — all active lines
router.get('/lines', (req, res) => {
  const db = getDb();
  const lines = db.prepare(`
    SELECT l.id, l.code, l.name, l.description, l.capacity, l.vehicle_type,
           l.status, l.ai_enabled, l.route_type, l.school_from, l.school_to,
           COUNT(s.id) as student_count
    FROM lines l LEFT JOIN students s ON s.line_id = l.id AND s.is_active = 1
    GROUP BY l.id ORDER BY l.route_type, l.code
  `).all();
  res.json({ data: lines, count: lines.length });
});

// GET /api/v1/lines/:id — single line + students + latest RUP
router.get('/lines/:id', (req, res) => {
  const db = getDb();
  const line = db.prepare('SELECT * FROM lines WHERE id = ?').get(req.params.id);
  if (!line) return res.status(404).json({ error: 'Line not found' });

  const students = db.prepare(`
    SELECT id, name, student_id, address, parent_name, parent_phone, has_app, is_active
    FROM students WHERE line_id = ? AND is_active = 1
  `).all(req.params.id);

  const latestRup = db.prepare(`
    SELECT week_date, week_number, actual_riders, registered_students, rup_percent, capacity
    FROM weekly_ridership WHERE line_id = ? ORDER BY week_date DESC LIMIT 4
  `).all(req.params.id);

  res.json({
    ...line,
    waypoints: JSON.parse(line.waypoints || '[]'),
    students,
    ridership: latestRup
  });
});

// GET /api/v1/ridership?week_number=&line_id= — ridership data
router.get('/ridership', (req, res) => {
  const db = getDb();
  const { week_number, line_id, limit = 50 } = req.query;
  let sql = `SELECT wr.*, l.name as line_name, l.code as line_code
    FROM weekly_ridership wr LEFT JOIN lines l ON l.id = wr.line_id WHERE 1=1`;
  const params = [];
  if (week_number) { sql += ' AND wr.week_number = ?'; params.push(parseInt(week_number)); }
  if (line_id) { sql += ' AND wr.line_id = ?'; params.push(parseInt(line_id)); }
  sql += ' ORDER BY wr.week_date DESC, l.code LIMIT ?';
  params.push(parseInt(limit));
  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows, count: rows.length });
});

// GET /api/v1/analysis/latest — latest weekly analysis
router.get('/analysis/latest', (req, res) => {
  const db = getDb();
  const analysis = db.prepare(`
    SELECT id, week_date, week_number, nps_score, satisfaction_level,
           positive_themes, negative_themes, recommendations, summary_hebrew, message_count, created_at
    FROM weekly_analysis ORDER BY week_date DESC LIMIT 1
  `).get();
  if (!analysis) return res.status(404).json({ error: 'No analysis found' });
  res.json({
    ...analysis,
    positive_themes: JSON.parse(analysis.positive_themes || '[]'),
    negative_themes: JSON.parse(analysis.negative_themes || '[]'),
    recommendations: JSON.parse(analysis.recommendations || '[]')
  });
});

// GET /api/v1/analysis — list of analyses (last N weeks)
router.get('/analysis', (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 10, 52);
  const rows = db.prepare(`
    SELECT id, week_date, week_number, nps_score, satisfaction_level,
           message_count, summary_hebrew, created_at
    FROM weekly_analysis ORDER BY week_date DESC LIMIT ?
  `).all(limit);
  res.json({ data: rows, count: rows.length });
});

// GET /api/v1/students?line_id=&is_active= — student list
router.get('/students', (req, res) => {
  const db = getDb();
  const { line_id, is_active = 1 } = req.query;
  let sql = `SELECT s.id, s.name, s.student_id, s.line_id, l.code as line_code,
    s.school_id, sc.name as school_name, s.address, s.parent_name, s.has_app, s.is_active
    FROM students s
    LEFT JOIN lines l ON l.id = s.line_id
    LEFT JOIN schools sc ON sc.id = s.school_id
    WHERE s.is_active = ?`;
  const params = [parseInt(is_active)];
  if (line_id) { sql += ' AND s.line_id = ?'; params.push(parseInt(line_id)); }
  sql += ' ORDER BY l.code, s.name';
  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows, count: rows.length });
});

// POST /api/v1/students/sync — bulk upsert students from SchoolRide
// Body: { students: [{student_id, name, line_code, school_name, address, parent_name, parent_phone, has_app}] }
router.post('/students/sync', (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || !students.length) {
    return res.status(400).json({ error: 'students array required' });
  }
  const db = getDb();
  let inserted = 0, updated = 0, errors = [];

  db.transaction(() => {
    for (const s of students) {
      try {
        if (!s.student_id || !s.name) { errors.push(`Missing student_id or name: ${JSON.stringify(s)}`); continue; }
        const line = s.line_code ? db.prepare('SELECT id FROM lines WHERE code = ?').get(s.line_code) : null;
        const school = s.school_name ? db.prepare('SELECT id FROM schools WHERE name = ?').get(s.school_name) : null;

        const existing = db.prepare('SELECT id FROM students WHERE student_id = ?').get(s.student_id);
        if (existing) {
          db.prepare(`UPDATE students SET name=?, line_id=?, school_id=?, address=?,
            parent_name=?, parent_phone=?, has_app=?, is_active=1 WHERE student_id=?`).run(
            s.name, line?.id || null, school?.id || null, s.address || null,
            s.parent_name || null, s.parent_phone || null, s.has_app ? 1 : 0, s.student_id);
          updated++;
        } else {
          db.prepare(`INSERT INTO students (student_id, name, line_id, school_id, address, parent_name, parent_phone, has_app)
            VALUES (?,?,?,?,?,?,?,?)`).run(
            s.student_id, s.name, line?.id || null, school?.id || null,
            s.address || null, s.parent_name || null, s.parent_phone || null, s.has_app ? 1 : 0);
          inserted++;
        }
      } catch (e) { errors.push(e.message); }
    }
  })();

  res.json({ success: true, inserted, updated, errors: errors.length ? errors : undefined });
});

// GET /api/v1/tasks?status=open — open tasks for SchoolRide dashboard
router.get('/tasks', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = 'SELECT id, title, priority, status, category, stakeholder, deadline, week_date FROM tasks WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY CASE priority WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, created_at DESC LIMIT 100';
  res.json({ data: db.prepare(sql).all(...params) });
});

module.exports = router;
