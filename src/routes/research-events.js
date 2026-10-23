'use strict';
const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const events = db.prepare(
      'SELECT * FROM research_events ORDER BY event_date ASC, id ASC'
    ).all();
    res.json(events.map(e => ({
      ...e,
      lines_affected: JSON.parse(e.lines_affected || '[]'),
      metric_before: e.metric_before ? JSON.parse(e.metric_before) : null,
      metric_after:  e.metric_after  ? JSON.parse(e.metric_after)  : null
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireRole('admin'), (req, res) => {
  const { event_date, week_number, event_type, title, description, lines_affected, metric_before, metric_after, impact_note } = req.body;
  if (!event_date || !title) return res.status(400).json({ error: 'תאריך וכותרת חובה' });
  try {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO research_events (event_date,week_number,event_type,title,description,lines_affected,metric_before,metric_after,impact_note,source)
      VALUES (?,?,?,?,?,?,?,?,?,'manual')
    `).run(
      event_date, week_number||null, event_type||'milestone', title, description||null,
      JSON.stringify(lines_affected||[]),
      metric_before ? JSON.stringify(metric_before) : null,
      metric_after  ? JSON.stringify(metric_after)  : null,
      impact_note||null
    );
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const { event_date, week_number, event_type, title, description, lines_affected, metric_before, metric_after, impact_note } = req.body;
  try {
    const db = getDb();
    db.prepare(`
      UPDATE research_events SET event_date=?,week_number=?,event_type=?,title=?,description=?,
        lines_affected=?,metric_before=?,metric_after=?,impact_note=?
      WHERE id=?
    `).run(
      event_date, week_number||null, event_type||'milestone', title, description||null,
      JSON.stringify(lines_affected||[]),
      metric_before ? JSON.stringify(metric_before) : null,
      metric_after  ? JSON.stringify(metric_after)  : null,
      impact_note||null, parseInt(req.params.id)
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM research_events WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// נתונים מאוחדים לדף המחקר
router.get('/academic-data', (req, res) => {
  try {
    const db = getDb();
    const events    = db.prepare('SELECT * FROM research_events ORDER BY event_date ASC').all();
    const rupTrend  = db.prepare(`
      SELECT wr.week_number, wr.week_date, l.code, l.name as line_name, l.ai_enabled,
             wr.actual_riders, wr.registered_students, wr.rup_percent
      FROM weekly_ridership wr JOIN lines l ON wr.line_id = l.id
      WHERE wr.week_number IS NOT NULL AND wr.cancelled = 0
      ORDER BY wr.week_number ASC, l.code
    `).all();
    const npsData   = db.prepare(`
      SELECT week_date, week_number, nps_score, satisfaction_level, message_count
      FROM weekly_analysis WHERE nps_score IS NOT NULL ORDER BY week_date ASC
    `).all();
    const lines     = db.prepare('SELECT id,code,name,status,ai_enabled,route_type FROM lines ORDER BY code').all();
    const rupTotal  = db.prepare(`
      SELECT week_number, week_date,
             SUM(actual_riders) as total_riders,
             SUM(registered_students) as total_registered,
             ROUND(100.0 * SUM(actual_riders) / NULLIF(SUM(registered_students),0), 2) as total_rup
      FROM weekly_ridership WHERE week_number IS NOT NULL AND cancelled = 0
      GROUP BY week_number ORDER BY week_number ASC
    `).all();
    const researchCodes = ['1A','1B','1C','1D','L3','L8','L9'];
    const phs = researchCodes.map(() => '?').join(',');
    const comparison = db.prepare(`
      SELECT wr.week_number, l.code, l.ai_enabled,
             ROUND(100.0 * wr.actual_riders / NULLIF(wr.registered_students,0), 1) as rup_percent
      FROM weekly_ridership wr JOIN lines l ON wr.line_id = l.id
      WHERE l.code IN (${phs}) AND wr.week_number IS NOT NULL AND wr.cancelled = 0
      ORDER BY wr.week_number ASC
    `).all(...researchCodes);

    res.json({
      events: events.map(e => ({
        ...e,
        lines_affected: JSON.parse(e.lines_affected || '[]'),
        metric_before: e.metric_before ? JSON.parse(e.metric_before) : null,
        metric_after:  e.metric_after  ? JSON.parse(e.metric_after)  : null
      })),
      rupTrend, npsData, lines, rupTotal, comparison
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
