const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');
const { analyzeStudentText } = require('../services/claudeService');

const router = express.Router();
router.use(auth);

// =====================================================================
// ניתוח WhatsApp תלמידים
// =====================================================================
router.post('/analyze', requireRole('admin'), async (req, res) => {
  const { week_date, week_number, text, line_id } = req.body;
  if (!week_date) return res.status(400).json({ error: 'יש לבחור תאריך שבוע' });
  if (!text || text.trim().length < 10) return res.status(400).json({ error: 'יש להדביק טקסט (לפחות 10 תווים)' });

  const db = getDb();
  try {
    const result = await analyzeStudentText(text.trim(), week_date, week_number);

    // שמור ניתוח תלמידים
    db.prepare(`INSERT OR REPLACE INTO student_whatsapp_analysis
      (week_date, week_number, line_id, nps_score, satisfaction_level, positive_themes, negative_themes,
       recommendations, tasks, summary_hebrew, raw_analysis, message_count, student_count, model_used)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      week_date, week_number || null, line_id || null,
      result.nps_score, result.satisfaction_level,
      JSON.stringify(result.positive_themes || []),
      JSON.stringify(result.negative_themes || []),
      JSON.stringify(result.recommendations || []),
      JSON.stringify(result.tasks || []),
      result.summary, result.raw_analysis,
      result.message_count || 0,
      result.student_count || 0,
      result.model_used
    );

    // שמור הודעות
    db.prepare(`INSERT INTO student_whatsapp_messages
      (week_date, week_number, line_id, student_name, message_text)
      VALUES (?,?,?,?,?)`)
      .run(week_date, week_number || null, line_id || null, 'קבוצת WhatsApp תלמידים', text.trim().substring(0, 5000));

    // צור משימות
    if (result.tasks?.length) {
      const insertTask = db.prepare(`INSERT INTO tasks
        (title, description, priority, deadline, stakeholder, category, week_date, week_number, source)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      db.transaction(() => {
        for (const t of result.tasks) {
          insertTask.run(
            t.title, t.description || '', t.priority || 'medium',
            t.deadline || null, t.stakeholder || 'מועצת תלמידים',
            t.category || 'שיפור', week_date, week_number || null, 'student_analysis'
          );
        }
      })();
    }

    res.json({ success: true, result });
  } catch (err) {
    if (err.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: 'מפתח API של Claude לא מוגדר ב-.env' });
    }
    res.status(500).json({ error: `שגיאת ניתוח: ${err.message}` });
  }
});

// קבלת ניתוח לפי שבוע
router.get('/week/:date', (req, res) => {
  const db = getDb();
  const analysis = db.prepare('SELECT * FROM student_whatsapp_analysis WHERE week_date = ?').get(req.params.date);
  if (!analysis) return res.status(404).json({ error: 'ניתוח תלמידים לא נמצא' });
  res.json({
    ...analysis,
    positive_themes: JSON.parse(analysis.positive_themes || '[]'),
    negative_themes: JSON.parse(analysis.negative_themes || '[]'),
    recommendations: JSON.parse(analysis.recommendations || '[]'),
    tasks: JSON.parse(analysis.tasks || '[]')
  });
});

// היסטוריה
router.get('/history', (req, res) => {
  const db = getDb();
  res.json(db.prepare(
    `SELECT id, week_date, week_number, nps_score, satisfaction_level,
     message_count, student_count, summary_hebrew, model_used, created_at
     FROM student_whatsapp_analysis ORDER BY week_date DESC`
  ).all());
});

// השוואה: NPS הורים מול NPS תלמידים
router.get('/comparison', (req, res) => {
  const db = getDb();
  const studentData = db.prepare(
    `SELECT week_date, week_number, nps_score as student_nps, satisfaction_level as student_level,
     summary_hebrew as student_summary
     FROM student_whatsapp_analysis ORDER BY week_date DESC LIMIT 12`
  ).all();

  const parentData = db.prepare(
    `SELECT week_date, week_number, nps_score as parent_nps, satisfaction_level as parent_level
     FROM weekly_analysis ORDER BY week_date DESC LIMIT 12`
  ).all();

  // מיזוג לפי תאריך
  const byDate = {};
  for (const p of parentData) {
    byDate[p.week_date] = { week_date: p.week_date, week_number: p.week_number, parent_nps: p.parent_nps, parent_level: p.parent_level };
  }
  for (const s of studentData) {
    if (!byDate[s.week_date]) byDate[s.week_date] = { week_date: s.week_date, week_number: s.week_number };
    byDate[s.week_date].student_nps = s.student_nps;
    byDate[s.week_date].student_level = s.student_level;
    byDate[s.week_date].student_summary = s.student_summary;
  }

  const result = Object.values(byDate).sort((a, b) => a.week_date > b.week_date ? 1 : -1);
  res.json(result);
});

// מחיקת ניתוח
router.delete('/week/:date', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM student_whatsapp_analysis WHERE week_date = ?').run(req.params.date);
    db.prepare('DELETE FROM student_whatsapp_messages WHERE week_date = ?').run(req.params.date);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
