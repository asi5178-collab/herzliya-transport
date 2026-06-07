const express = require('express');
const { getDb } = require('../../database/db');
const { auth } = require('../auth/middleware');

const router = express.Router();
router.use(auth);

router.get('/summary', (req, res) => {
  try {
    const db = getDb();
    const totalStudents = db.prepare('SELECT COUNT(*) as c FROM students WHERE is_active = 1').get().c;
    const activeLines   = db.prepare("SELECT COUNT(*) as c FROM lines WHERE status = 'active'").get().c;

    const lastWeekRup = db.prepare(`
      SELECT week_date, week_number,
             SUM(actual_riders) as total_riders,
             SUM(registered_students) as total_registered,
             ROUND(100.0 * SUM(actual_riders) / SUM(registered_students), 1) as total_rup
      FROM weekly_ridership
      WHERE week_number IS NOT NULL
      AND week_date = (SELECT MAX(week_date) FROM weekly_ridership WHERE week_number IS NOT NULL)
    `).get();

    const lastAnalysis = db.prepare(`
      SELECT nps_score, satisfaction_level, week_date, week_number
      FROM weekly_analysis
      WHERE week_number IS NOT NULL AND nps_score IS NOT NULL
      ORDER BY week_date DESC LIMIT 1
    `).get();

    const openTasks  = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status != 'done'").get().c;
    const weeksCount = db.prepare('SELECT COUNT(DISTINCT week_number) as c FROM weekly_ridership WHERE week_number IS NOT NULL').get().c;

    res.json({
      total_students: totalStudents,
      active_lines:   activeLines,
      current_rup:    lastWeekRup?.total_rup || 0,
      current_nps:    lastAnalysis?.nps_score || 0,
      satisfaction_level: lastAnalysis?.satisfaction_level || null,
      open_tasks:     openTasks,
      last_week:      lastWeekRup?.week_date,
      last_week_number: lastWeekRup?.week_number,
      weeks_tracked:  weeksCount,
      total_riders_last_week: lastWeekRup?.total_riders || 0,
      total_registered: lastWeekRup?.total_registered || 0
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/rup-trend', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(`
      SELECT wr.week_date, wr.week_number, l.name as line_name, l.code,
             wr.actual_riders, wr.registered_students, wr.rup_percent, wr.capacity
      FROM weekly_ridership wr JOIN lines l ON wr.line_id = l.id
      WHERE wr.week_number IS NOT NULL
      ORDER BY wr.week_number ASC, l.code
    `).all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/rup-total', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(`
      SELECT week_number, week_date,
             SUM(actual_riders) as total_riders,
             SUM(registered_students) as total_registered,
             ROUND(100.0 * SUM(actual_riders) / SUM(registered_students), 2) as total_rup
      FROM weekly_ridership
      WHERE week_number IS NOT NULL
      GROUP BY week_number
      ORDER BY week_number ASC
    `).all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/nps-trend', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(`
      SELECT week_date, week_number, nps_score, satisfaction_level, message_count, summary_hebrew
      FROM weekly_analysis
      WHERE week_number IS NOT NULL AND nps_score IS NOT NULL
      ORDER BY week_number ASC
    `).all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/correlation', (req, res) => {
  try {
    const db = getDb();
    const rupByWeek = db.prepare(`
      SELECT week_number,
             ROUND(100.0 * SUM(actual_riders) / SUM(registered_students), 1) as avg_rup,
             SUM(actual_riders) as total_riders
      FROM weekly_ridership WHERE week_number IS NOT NULL
      GROUP BY week_number
    `).all();

    const npsMap = {};
    db.prepare(`SELECT week_number, nps_score FROM weekly_analysis WHERE week_number IS NOT NULL AND nps_score IS NOT NULL`).all()
      .forEach(n => { npsMap[n.week_number] = n.nps_score; });

    res.json(rupByWeek
      .filter(r => npsMap[r.week_number] !== undefined)
      .map(r => ({ week_number: r.week_number, avg_rup: r.avg_rup, total_riders: r.total_riders, nps_score: npsMap[r.week_number] }))
    );
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/open-tasks', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(`SELECT * FROM tasks WHERE status != 'done'
      ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, deadline ASC LIMIT 10`).all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/weekly-summary', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(`
      SELECT wr.week_number, wr.week_date,
             SUM(wr.actual_riders) as total_riders,
             ROUND(100.0 * SUM(wr.actual_riders) / SUM(wr.registered_students), 1) as avg_rup,
             wa.nps_score, wa.satisfaction_level, wa.message_count
      FROM weekly_ridership wr
      LEFT JOIN weekly_analysis wa ON wr.week_number = wa.week_number
      WHERE wr.week_number IS NOT NULL
      GROUP BY wr.week_number
      ORDER BY wr.week_number DESC
    `).all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
