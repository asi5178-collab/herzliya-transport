'use strict';
const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');
const { analyzeStudentText } = require('../services/claudeService');

const router = express.Router();
router.use(auth);

// ניתוח טקסט חדש מקבוצת תלמידים
router.post('/analyze', requireRole('admin'), async (req, res) => {
  const { week_date, week_number, text, source_group } = req.body;
  if (!week_date) return res.status(400).json({ error: 'יש לבחור תאריך שבוע' });
  if (!text || text.trim().length < 10) return res.status(400).json({ error: 'יש להדביק טקסט (לפחות 10 תווים)' });

  try {
    const result = await analyzeStudentText(text.trim(), week_date, week_number);

    const db = getDb();
    db.prepare(`INSERT OR REPLACE INTO student_analysis
      (week_date, week_number, source_group, satisfaction_score, satisfaction_level,
       positive_themes, negative_themes, student_insights, recommendations,
       tasks, summary_hebrew, raw_analysis, message_count, model_used)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      week_date, week_number, source_group || 'קבוצת תלמידים',
      result.satisfaction_score || result.nps_score,
      result.satisfaction_level,
      JSON.stringify(result.positive_themes || []),
      JSON.stringify(result.negative_themes || []),
      JSON.stringify(result.student_insights || []),
      JSON.stringify(result.recommendations || []),
      JSON.stringify(result.tasks || []),
      result.summary,
      result.raw_analysis,
      result.message_count || 0,
      result.model_used || 'claude-sonnet-4-6'
    );

    // הוסף משימות לטבלת המשימות הכללית
    if (result.tasks?.length) {
      const insertTask = db.prepare(`INSERT INTO tasks
        (title, description, priority, deadline, stakeholder, category, week_date, week_number, source)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      db.transaction(() => {
        for (const t of result.tasks) {
          insertTask.run(
            t.title, t.description || '', t.priority || 'medium',
            t.deadline || null, t.stakeholder || 'מועצת תלמידים',
            t.category || 'שיפור', week_date, week_number, 'student_analysis'
          );
        }
      })();
    }

    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: 'מפתח API של Claude לא מוגדר' });
    }
    res.status(500).json({ error: `שגיאת ניתוח: ${err.message}` });
  }
});

// היסטוריה
router.get('/history', (req, res) => {
  const db = getDb();
  res.json(db.prepare(
    `SELECT id, week_date, week_number, source_group, satisfaction_score,
     satisfaction_level, message_count, summary_hebrew, model_used, created_at
     FROM student_analysis ORDER BY week_date DESC`
  ).all());
});

// ניתוח לפי שבוע
router.get('/week/:date', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM student_analysis WHERE week_date = ?').get(req.params.date);
  if (!row) return res.status(404).json({ error: 'ניתוח לא נמצא' });
  res.json({
    ...row,
    positive_themes:  JSON.parse(row.positive_themes  || '[]'),
    negative_themes:  JSON.parse(row.negative_themes  || '[]'),
    student_insights: JSON.parse(row.student_insights || '[]'),
    recommendations:  JSON.parse(row.recommendations  || '[]'),
    tasks:            JSON.parse(row.tasks            || '[]')
  });
});

// מחיקה
router.delete('/week/:date', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM student_analysis WHERE week_date = ?').run(req.params.date);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
