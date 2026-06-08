const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');
const { analyzeRawText, generateWeeklyReport, optimizeRoute } = require('../services/claudeService');

const router = express.Router();
router.use(auth);

// =====================================================================
// ניתוח טקסט חופשי - ללא צורך בפורמט מסוים
// =====================================================================
router.post('/whatsapp-text', requireRole('admin'), async (req, res) => {
  const { week_date, week_number, text, line_id } = req.body;
  if (!week_date) return res.status(400).json({ error: 'יש לבחור תאריך שבוע' });
  if (!text || text.trim().length < 10) return res.status(400).json({ error: 'יש להדביק טקסט (לפחות 10 תווים)' });

  const db = getDb();
  const rupData = db.prepare('SELECT AVG(rup_percent) as avg_rup FROM weekly_ridership WHERE week_date = ?').get(week_date);

  try {
    const result = await analyzeRawText(text.trim(), week_date, week_number, {
      current_rup: rupData?.avg_rup?.toFixed(1)
    });

    // שמור ניתוח
    db.prepare(`INSERT OR REPLACE INTO weekly_analysis
      (week_date, week_number, nps_score, satisfaction_level, positive_themes, negative_themes,
       recommendations, tasks, summary_hebrew, raw_analysis, message_count, model_used)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      week_date, week_number,
      result.nps_score, result.satisfaction_level,
      JSON.stringify(result.positive_themes || []),
      JSON.stringify(result.negative_themes || []),
      JSON.stringify(result.recommendations || []),
      JSON.stringify(result.tasks || []),
      result.summary, result.raw_analysis,
      result.message_count || 0, result.model_used
    );

    // שמור את הטקסט כהודעה יחידה לצורך ארכיון
    db.prepare(`INSERT INTO whatsapp_messages (week_date, week_number, line_id, sender_name, message_text) VALUES (?,?,?,?,?)`)
      .run(week_date, week_number, line_id || null, 'קבוצת WhatsApp', text.trim().substring(0, 5000));

    // צור משימות
    if (result.tasks?.length) {
      const insertTask = db.prepare(`INSERT INTO tasks
        (title, description, priority, deadline, stakeholder, category, week_date, week_number, source)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      db.transaction(() => {
        for (const t of result.tasks) {
          insertTask.run(t.title, t.description || '', t.priority || 'medium',
            t.deadline || null, t.stakeholder || 'מנהל הסעות',
            t.category || 'שיפור', week_date, week_number, 'analysis');
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
  const analysis = db.prepare('SELECT * FROM weekly_analysis WHERE week_date = ?').get(req.params.date);
  if (!analysis) return res.status(404).json({ error: 'ניתוח לא נמצא' });
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
     message_count, summary_hebrew, model_used, created_at
     FROM weekly_analysis ORDER BY week_date DESC`
  ).all());
});

// אופטימיזציה
router.post('/optimize-route', requireRole('admin'), async (req, res) => {
  const { line_id } = req.body;
  if (!line_id) return res.status(400).json({ error: 'נדרש מזהה קו' });
  const db = getDb();
  const line = db.prepare('SELECT * FROM lines WHERE id = ?').get(line_id);
  if (!line) return res.status(404).json({ error: 'קו לא נמצא' });
  const students = db.prepare('SELECT name, address, latitude, longitude FROM students WHERE line_id = ? AND is_active = 1').all(line_id);
  try {
    const { optimizeRoute: opt } = require('../services/claudeService');
    const result = await opt({ ...line, waypoints: JSON.parse(line.waypoints || '[]') }, students);
    res.json({ success: true, recommendations: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// יצירת דוח
router.post('/generate-report', requireRole('admin'), async (req, res) => {
  const { week_date } = req.body;
  if (!week_date) return res.status(400).json({ error: 'תאריך שבוע חובה' });
  const db = getDb();
  const analysis = db.prepare('SELECT * FROM weekly_analysis WHERE week_date = ?').get(week_date);
  const rup = db.prepare('SELECT ROUND(100.0*SUM(actual_riders)/SUM(registered_students),1) as avg_rup, SUM(actual_riders) as total FROM weekly_ridership WHERE week_date = ?').get(week_date);
  if (!analysis) return res.status(404).json({ error: 'ניתוח לא קיים לשבוע זה' });
  try {
    const report = await generateWeeklyReport({
      week_date, week_number: analysis.week_number,
      nps_score: analysis.nps_score, satisfaction_level: analysis.satisfaction_level,
      avg_rup: rup?.avg_rup, total_riders: rup?.total,
      positive_themes: JSON.parse(analysis.positive_themes || '[]'),
      negative_themes: JSON.parse(analysis.negative_themes || '[]'),
      recommendations: JSON.parse(analysis.recommendations || '[]')
    });
    db.prepare('INSERT INTO reports (week_date, title, content_hebrew, created_by) VALUES (?,?,?,?)').run(
      week_date, `דוח שבועי שבוע ${analysis.week_number} (${week_date})`, report, req.user.id);
    res.json({ success: true, report });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// עדכון ניתוח ידני
router.put('/week/:date', requireRole('admin'), (req, res) => {
  try {
    const { nps_score, satisfaction_level, summary_hebrew, positive_themes, negative_themes, recommendations } = req.body;
    const db = getDb();
    const existing = db.prepare('SELECT id FROM weekly_analysis WHERE week_date = ?').get(req.params.date);
    if (!existing) return res.status(404).json({ error: 'ניתוח לא נמצא' });

    db.prepare(`UPDATE weekly_analysis
      SET nps_score=?, satisfaction_level=?, summary_hebrew=?,
          positive_themes=?, negative_themes=?, recommendations=?
      WHERE week_date=?`).run(
      parseFloat(nps_score),
      satisfaction_level,
      summary_hebrew,
      JSON.stringify(positive_themes || []),
      JSON.stringify(negative_themes || []),
      JSON.stringify(recommendations || []),
      req.params.date
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// מחיקת ניתוח שבועי
router.delete('/week/:date', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM weekly_analysis WHERE week_date = ?').run(req.params.date);
    db.prepare('DELETE FROM whatsapp_messages WHERE week_date = ?').run(req.params.date);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// מחיקה לפי מספר שבוע
router.delete('/week-num/:num', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const num = parseInt(req.params.num);
    db.prepare('DELETE FROM weekly_analysis WHERE week_number = ?').run(num);
    db.prepare('DELETE FROM whatsapp_messages WHERE week_number = ?').run(num);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
