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

// יצירת דוח — HTML מעוצב עם כל המשימות הפתוחות לפי בעל עניין
router.post('/generate-report', requireRole('admin'), (req, res) => {
  const { week_date } = req.body;
  if (!week_date) return res.status(400).json({ error: 'תאריך שבוע חובה' });
  const db = getDb();
  const analysis = db.prepare('SELECT * FROM weekly_analysis WHERE week_date = ?').get(week_date);
  const rup = db.prepare('SELECT ROUND(100.0*SUM(actual_riders)/SUM(registered_students),1) as avg_rup, SUM(actual_riders) as total, SUM(registered_students) as total_registered FROM weekly_ridership WHERE week_date = ?').get(week_date);
  const rupLines = db.prepare(`
    SELECT wr.registered_students, wr.actual_riders, wr.rup_percent, wr.capacity,
           COALESCE(l.name, 'קו ' || wr.line_id) as line_name,
           COALESCE(l.code, '') as line_code
    FROM weekly_ridership wr
    LEFT JOIN lines l ON l.id = wr.line_id
    WHERE wr.week_date = ?
    ORDER BY l.code`).all(week_date);
  if (!analysis) return res.status(404).json({ error: 'ניתוח לא קיים לשבוע זה' });

  const openTasks = db.prepare(
    `SELECT * FROM tasks WHERE status != 'done'
     ORDER BY stakeholder,
       CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC`
  ).all();

  const sa = db.prepare('SELECT * FROM student_analysis WHERE week_date = ?').get(week_date);

  const report = buildHTMLReport({
    week_date, week_number: analysis.week_number,
    nps_score: analysis.nps_score, satisfaction_level: analysis.satisfaction_level,
    avg_rup: rup?.avg_rup, total_riders: rup?.total, total_registered: rup?.total_registered,
    rupLines: rupLines || [],
    summary: analysis.summary_hebrew,
    posThemes: JSON.parse(analysis.positive_themes || '[]'),
    negThemes: JSON.parse(analysis.negative_themes || '[]'),
    recommendations: JSON.parse(analysis.recommendations || '[]'),
    openTasks,
    student: sa ? {
      score: sa.satisfaction_score,
      level: sa.satisfaction_level,
      summary: sa.summary_hebrew,
      source_group: sa.source_group || 'קבוצת תלמידים',
      insights: JSON.parse(sa.student_insights || '[]'),
      posThemes: JSON.parse(sa.positive_themes || '[]'),
      negThemes: JSON.parse(sa.negative_themes || '[]')
    } : null
  });

  const title = `דוח שבועי שבוע ${analysis.week_number || ''} (${week_date})`.trim();
  db.prepare('INSERT INTO reports (week_date, title, content_hebrew, created_by) VALUES (?,?,?,?)').run(
    week_date, title, report, req.user.id);
  res.json({ success: true, report });
});

function buildHTMLReport(d) {
  const dateStr = d.week_date ? new Date(d.week_date).toLocaleDateString('he-IL') : '';
  const satMap = { excellent: ['מצוין','#16a34a'], good: ['טוב','#2563eb'], developing: ['בפיתוח','#d97706'], critical: ['קריטי','#dc2626'] };
  const [satLabel, satColor] = satMap[d.satisfaction_level] || [d.satisfaction_level || '', '#64748b'];
  const priLabel = { high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' };
  const priColor = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };
  const stLabel  = { open: 'פתוח', in_progress: 'בביצוע' };

  // קיבוץ לפי בעל עניין
  const byStakeholder = {};
  for (const t of d.openTasks) {
    const sh = t.stakeholder || 'כללי';
    (byStakeholder[sh] = byStakeholder[sh] || []).push(t);
  }

  const li = s => `<li style="padding:4px 0;color:#374151;">${s}</li>`;

  let tasksHTML = '';
  for (const [sh, tasks] of Object.entries(byStakeholder)) {
    const highCount = tasks.filter(t => t.priority === 'high').length;
    tasksHTML += `
      <div style="margin-bottom:20px;">
        <div style="background:#1e40af;color:white;padding:9px 16px;border-radius:6px 6px 0 0;font-weight:700;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
          <span>${sh}</span>
          <span style="font-size:11px;opacity:0.85;">${tasks.length} משימות${highCount ? ' | ' + highCount + ' דחופות' : ''}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-top:none;font-size:13px;">
          <thead>
            <tr style="background:#eff6ff;">
              <th style="padding:8px 12px;text-align:right;color:#475569;border-bottom:1px solid #e2e8f0;width:80px;">דחיפות</th>
              <th style="padding:8px 12px;text-align:right;color:#475569;border-bottom:1px solid #e2e8f0;">משימה</th>
              <th style="padding:8px 12px;text-align:right;color:#475569;border-bottom:1px solid #e2e8f0;width:90px;">קטגוריה</th>
              <th style="padding:8px 12px;text-align:right;color:#475569;border-bottom:1px solid #e2e8f0;width:80px;">סטטוס</th>
              <th style="padding:8px 12px;text-align:right;color:#475569;border-bottom:1px solid #e2e8f0;width:100px;">יעד לסיום</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map((t, i) => `
            <tr style="background:${i % 2 === 0 ? 'white' : '#f8fafc'};">
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">
                <span style="background:${priColor[t.priority] || '#64748b'}22;color:${priColor[t.priority] || '#64748b'};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${priLabel[t.priority] || t.priority}</span>
              </td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${t.title}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${t.category || ''}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${stLabel[t.status] || t.status}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${t.deadline ? new Date(t.deadline).toLocaleDateString('he-IL') : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  if (!tasksHTML) {
    tasksHTML = '<div style="color:#16a34a;padding:16px;background:#f0fdf4;border-radius:8px;text-align:center;font-size:14px;">אין משימות פתוחות לטיפול</div>';
  }

  return `<div style="font-family:\'Segoe UI\',\'Arial Hebrew\',Arial,sans-serif;direction:rtl;color:#1e293b;max-width:860px;">

  <div style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 60%,#2563eb 100%);color:white;padding:28px 32px;border-radius:10px;margin-bottom:24px;text-align:center;">
    <div style="font-size:11px;letter-spacing:3px;opacity:0.75;margin-bottom:8px;">עיריית הרצליה</div>
    <div style="font-size:26px;font-weight:800;margin-bottom:4px;">דוח ניהולי שבועי</div>
    <div style="font-size:14px;opacity:0.85;">מערכת הסעות תיכונים</div>
    <div style="margin-top:14px;font-size:13px;background:rgba(255,255,255,0.18);display:inline-block;padding:5px 22px;border-radius:20px;">שבוע ${d.week_number || ''} &nbsp;|&nbsp; ${dateStr}</div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(${d.student ? 4 : 3},1fr);gap:16px;margin-bottom:${d.rupLines?.length ? 12 : 24}px;">
    <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-align:center;border-top:3px solid #2563eb;">
      <div style="font-size:30px;font-weight:800;color:#2563eb;">${d.nps_score != null ? Number(d.nps_score).toFixed(1) : 'N/A'}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">NPS הורים (מתוך 5)</div>
    </div>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-align:center;border-top:3px solid #16a34a;">
      <div style="font-size:30px;font-weight:800;color:#16a34a;">${d.avg_rup != null ? d.avg_rup + '%' : 'N/A'}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">שיעור ניצול (RUP)<br><span style="font-size:11px;">${d.total_riders != null ? d.total_riders + ' / ' + (d.total_registered || '?') + ' נוסעים' : ''}</span></div>
    </div>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-align:center;border-top:3px solid ${satColor};">
      <div style="font-size:30px;font-weight:800;color:${satColor};">${satLabel}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">רמת שביעות הורים</div>
    </div>
    ${d.student ? (() => {
      const stuMap = { excellent: ['מצוין','#16a34a'], good: ['טוב','#2563eb'], developing: ['בפיתוח','#d97706'], critical: ['קריטי','#dc2626'] };
      const [sLabel, sColor] = stuMap[d.student.level] || [d.student.level || 'N/A', '#64748b'];
      return `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-align:center;border-top:3px solid #7c3aed;">
        <div style="font-size:30px;font-weight:800;color:#7c3aed;">${d.student.score ? Number(d.student.score).toFixed(1) : sLabel}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">שביעות תלמידים (מתוך 5)</div>
      </div>`;
    })() : ''}
  </div>

  ${d.rupLines?.length ? `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:0;margin-bottom:24px;overflow:hidden;">
    <div style="padding:10px 16px;background:#f0fdf4;border-bottom:1px solid #dcfce7;font-weight:700;font-size:13px;color:#15803d;">
      <i>🚌</i> פירוט נסיעות לפי קו — שבוע ${d.week_number || ''}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 14px;text-align:right;color:#475569;border-bottom:1px solid #e2e8f0;">קו</th>
          <th style="padding:8px 14px;text-align:center;color:#475569;border-bottom:1px solid #e2e8f0;">רשומים</th>
          <th style="padding:8px 14px;text-align:center;color:#475569;border-bottom:1px solid #e2e8f0;">נסעו בפועל</th>
          <th style="padding:8px 14px;text-align:center;color:#475569;border-bottom:1px solid #e2e8f0;">RUP%</th>
          <th style="padding:8px 14px;text-align:center;color:#475569;border-bottom:1px solid #e2e8f0;">קיבולת</th>
        </tr>
      </thead>
      <tbody>
        ${d.rupLines.map((l, i) => {
          const rup = l.rup_percent ?? (l.registered_students ? +(100 * l.actual_riders / l.registered_students).toFixed(1) : null);
          const rupColor = rup == null ? '#94a3b8' : rup >= 70 ? '#16a34a' : rup >= 40 ? '#d97706' : '#dc2626';
          return `<tr style="background:${i % 2 === 0 ? 'white' : '#f8fafc'};">
            <td style="padding:8px 14px;font-weight:600;">${l.line_code ? `[${l.line_code}] ` : ''}${l.line_name}</td>
            <td style="padding:8px 14px;text-align:center;color:#374151;">${l.registered_students ?? '-'}</td>
            <td style="padding:8px 14px;text-align:center;color:#374151;">${l.actual_riders ?? '-'}</td>
            <td style="padding:8px 14px;text-align:center;">
              <span style="font-weight:700;color:${rupColor};">${rup != null ? rup + '%' : '-'}</span>
            </td>
            <td style="padding:8px 14px;text-align:center;color:#94a3b8;">${l.capacity ?? '-'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>` : d.avg_rup == null ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 16px;margin-bottom:24px;font-size:12px;color:#854d0e;"><i>⚠️</i> נתוני RUP לא הוזנו לשבוע זה — ניתן להזין ב<a href="weekly.html" style="color:#854d0e;font-weight:600;">נסיעות שבועיות</a></div>` : ''}

  ${d.summary ? `<div style="background:#f8fafc;border-right:4px solid #2563eb;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;font-size:14px;line-height:1.85;color:#334155;">${d.summary}</div>` : ''}

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
    ${d.posThemes.length ? `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:18px;">
      <div style="font-weight:700;color:#16a34a;margin-bottom:12px;font-size:14px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">חוזקות</div>
      <ul style="margin:0;padding-right:18px;font-size:13px;">${d.posThemes.map(li).join('')}</ul>
    </div>` : ''}
    ${d.negThemes.length ? `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:18px;">
      <div style="font-weight:700;color:#dc2626;margin-bottom:12px;font-size:14px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">אתגרים</div>
      <ul style="margin:0;padding-right:18px;font-size:13px;">${d.negThemes.map(li).join('')}</ul>
    </div>` : ''}
  </div>

  ${d.recommendations.length ? `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-bottom:24px;">
    <div style="font-weight:700;color:#7c3aed;margin-bottom:12px;font-size:14px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">המלצות לפעולה — הורים</div>
    <ul style="margin:0;padding-right:18px;font-size:13px;">${d.recommendations.map(li).join('')}</ul>
  </div>` : ''}

  ${d.student ? `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-bottom:24px;border-right:4px solid #7c3aed;">
    <div style="font-weight:700;color:#7c3aed;margin-bottom:12px;font-size:14px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">
      🎓 ניתוח קבוצת תלמידים — ${d.student.source_group}
    </div>
    ${d.student.summary ? `<div style="background:#faf5ff;border-right:3px solid #7c3aed;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:14px;font-size:13px;line-height:1.85;color:#374151;">${d.student.summary}</div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">
      ${d.student.posThemes?.length ? `<div>
        <div style="font-weight:700;color:#16a34a;font-size:12px;margin-bottom:6px;">חיובי בעיני התלמידים</div>
        <ul style="margin:0;padding-right:16px;font-size:12px;">${d.student.posThemes.map(t => `<li style="padding:3px 0;color:#374151;">${t}</li>`).join('')}</ul>
      </div>` : ''}
      ${d.student.negThemes?.length ? `<div>
        <div style="font-weight:700;color:#dc2626;font-size:12px;margin-bottom:6px;">בעיות שמועלות</div>
        <ul style="margin:0;padding-right:16px;font-size:12px;">${d.student.negThemes.map(t => `<li style="padding:3px 0;color:#374151;">${t}</li>`).join('')}</ul>
      </div>` : ''}
    </div>
    ${d.student.insights?.length ? `<div>
      <div style="font-weight:700;color:#7c3aed;font-size:12px;margin-bottom:6px;">תובנות ייחודיות לתלמידים</div>
      ${d.student.insights.map(ins => `<div style="display:flex;gap:8px;padding:4px 0;font-size:12px;"><span style="color:#7c3aed;flex-shrink:0;">◆</span><span style="color:#374151;">${ins}</span></div>`).join('')}
    </div>` : ''}
  </div>` : ''}

  <div style="margin-bottom:24px;">
    <div style="font-weight:700;font-size:15px;margin-bottom:16px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">
      משימות פתוחות לטיפול
      <span style="font-size:13px;color:#64748b;font-weight:400;margin-right:8px;">${d.openTasks.length} משימות</span>
    </div>
    ${tasksHTML}
  </div>

  <div style="text-align:center;padding:16px;color:#94a3b8;font-size:11px;border-top:1px solid #f1f5f9;margin-top:8px;">
    עיריית הרצליה &nbsp;|&nbsp; מערכת ניהול הסעות תיכונים &nbsp;|&nbsp; הופק: ${new Date().toLocaleDateString('he-IL')}
  </div>
</div>`;
}

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
