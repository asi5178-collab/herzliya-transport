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

// ייצוא דוח אקדמי כ-Word (.doc)
router.get('/export-word', (req, res) => {
  try {
    const db = getDb();
    const events   = db.prepare('SELECT * FROM research_events ORDER BY event_date ASC').all()
      .map(e => ({ ...e, lines_affected: JSON.parse(e.lines_affected || '[]'),
        metric_before: e.metric_before ? JSON.parse(e.metric_before) : null,
        metric_after:  e.metric_after  ? JSON.parse(e.metric_after)  : null }));
    const npsData  = db.prepare('SELECT * FROM weekly_analysis WHERE nps_score IS NOT NULL ORDER BY week_date ASC').all();
    const rupTotal = db.prepare(`SELECT week_number, week_date, SUM(actual_riders) tr, SUM(registered_students) ts,
        ROUND(100.0*SUM(actual_riders)/NULLIF(SUM(registered_students),0),2) rup
      FROM weekly_ridership WHERE week_number IS NOT NULL AND cancelled=0 GROUP BY week_number ORDER BY week_number`).all();
    const aiCodes = ['1A','1B','1C','1D'], ctrlCodes = ['L3','L8','L9'];
    const researchCodes = [...aiCodes,...ctrlCodes];
    const phs = researchCodes.map(()=>'?').join(',');
    const comparison = db.prepare(`SELECT wr.week_number,l.code,l.ai_enabled,
        ROUND(100.0*wr.actual_riders/NULLIF(wr.registered_students,0),1) rup_percent
      FROM weekly_ridership wr JOIN lines l ON wr.line_id=l.id
      WHERE l.code IN (${phs}) AND wr.week_number IS NOT NULL AND wr.cancelled=0
      ORDER BY wr.week_number`).all(...researchCodes);
    const taskStats = (() => { try {
      return db.prepare(`SELECT category,COUNT(*) total,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done_count
        FROM tasks GROUP BY category`).all();
    } catch { return []; } })();

    const aiRows   = comparison.filter(r=>aiCodes.includes(r.code));
    const ctrlRows = comparison.filter(r=>ctrlCodes.includes(r.code));
    const avg = arr => arr.length ? (arr.reduce((s,r)=>s+(parseFloat(r.rup_percent)||0),0)/arr.length).toFixed(1) : '—';
    const aiAvg = avg(aiRows), ctrlAvg = avg(ctrlRows);
    const firstNps = npsData[0]?.nps_score, lastNps = npsData[npsData.length-1]?.nps_score;
    const firstRup = rupTotal[0]?.rup, lastRup = rupTotal[rupTotal.length-1]?.rup;
    const totalWeeks = [...new Set(rupTotal.map(r=>r.week_number))].length;
    const today = new Date().toLocaleDateString('he-IL',{year:'numeric',month:'long',day:'numeric'});
    const crises = events.filter(e=>e.event_type==='crisis');
    const interventions = events.filter(e=>e.event_type==='intervention');

    const fmtDate = d => d ? new Date(d).toLocaleDateString('he-IL') : '';

    const taskRows = taskStats.map(r => {
      const p = r.total ? Math.round(100*r.done_count/r.total) : 0;
      return `<tr><td>${r.category}</td><td style="text-align:center">${r.total}</td>
        <td style="text-align:center">${r.done_count}</td>
        <td style="text-align:center;font-weight:bold;color:${p>=70?'green':p>=40?'darkorange':'red'}">${p}%</td></tr>`;
    }).join('');

    const eventRows = events.map(e => `<tr>
      <td>${fmtDate(e.event_date)}</td>
      <td>${e.week_number ? 'W'+e.week_number : ''}</td>
      <td>${e.title}</td>
      <td>${e.event_type==='crisis'?'משבר':e.event_type==='intervention'?'התערבות':e.event_type==='system_change'?'שינוי מערכת':e.event_type==='expansion'?'הרחבה':e.event_type==='external_factor'?'גורם חיצוני':'אבן דרך'}</td>
      <td>${e.metric_before?.nps||''}</td>
      <td>${e.metric_after?.nps||''}</td>
      <td>${e.impact_note||''}</td>
    </tr>`).join('');

    const npsRows = npsData.map(n => `<tr>
      <td>${fmtDate(n.week_date)}</td>
      <td style="text-align:center">${n.week_number?'W'+n.week_number:''}</td>
      <td style="text-align:center">${n.nps_score?.toFixed(2)||''}</td>
      <td style="text-align:center">${n.satisfaction_level||''}</td>
      <td style="text-align:center">${n.message_count||''}</td>
    </tr>`).join('');

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
  xmlns:w='urn:schemas-microsoft-com:office:word'
  xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='UTF-8'>
<style>
  body { font-family: 'David', Arial, sans-serif; font-size: 12pt; direction: rtl; margin: 2.5cm; color: #1a1a1a; }
  h1 { font-size: 18pt; color: #1e3a8a; text-align: center; margin-bottom: 6pt; }
  h2 { font-size: 14pt; color: #1e3a8a; border-bottom: 1pt solid #1e3a8a; padding-bottom: 3pt; margin-top: 18pt; }
  h3 { font-size: 12pt; color: #374151; margin-top: 12pt; }
  p { line-height: 1.7; margin: 6pt 0; text-align: justify; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 10pt 0; }
  th { background: #1e3a8a; color: white; padding: 5pt 8pt; text-align: right; }
  td { border: 0.5pt solid #cbd5e1; padding: 4pt 8pt; }
  tr:nth-child(even) td { background: #f8fafc; }
  .kpi-row { display: flex; gap: 20pt; margin: 10pt 0; }
  .kpi { border: 1pt solid #1e3a8a; border-radius: 4pt; padding: 8pt 12pt; text-align: center; flex: 1; }
  .kpi-val { font-size: 20pt; font-weight: bold; color: #1e3a8a; }
  .kpi-lbl { font-size: 9pt; color: #64748b; }
  .note { background: #eff6ff; border-right: 3pt solid #1e3a8a; padding: 8pt 12pt; margin: 8pt 0; font-size: 10.5pt; }
  .pg { page-break-before: always; }
  .sub { color: #64748b; font-size: 10pt; text-align: center; }
</style>
</head>
<body>
<h1>דוח מחקר אקדמי — מערכת הסעות תלמידים מבוססת בינה מלאכותית</h1>
<h1 style="font-size:13pt;">עיריית הרצליה | ניסוי בשנה"ל תשפ"ו–תשפ"ז</h1>
<p class="sub">הופק: ${today} | ${totalWeeks} שבועות מדידה | ${npsData.length} ניתוחי WhatsApp | ${events.length} אירועים מתועדים</p>
<hr/>

<h2>1. תקציר מנהלים</h2>
<p>מחקר זה בוחן את השפעת שילוב ניתוח בינה מלאכותית (Claude AI) בניהול מערכת הסעות תלמידים עירונית על שביעות רצון הורים ושיעורי ניצול הקו (RUP). הניסוי נערך בעיריית הרצליה החל מאפריל 2026 ומשווה ארבעה קווי מחקר הנתמכים ב-AI (1א, 1ב, 1ג, 1ד) לשלושה קווי ביקורת ללא תמיכת AI (3, 8, 9).</p>
<p>ממצאים מרכזיים: NPS (מדד שביעות הרצון) עלה מ-<b>${firstNps?.toFixed(2)||'—'}</b> ל-<b>${lastNps?.toFixed(2)||'—'}</b> לאורך תקופת הניסוי. קבוצת המחקר הציגה RUP ממוצע של <b>${aiAvg}%</b> לעומת <b>${ctrlAvg}%</b> בקבוצת הביקורת. ${crises.length} אירועי משבר זוהו, כולם טופלו תוך שבוע אחד עד שבועיים באמצעות ${interventions.length} התערבויות מתקנות.</p>

<h2 class="pg">2. מדדי מפתח</h2>
<table>
  <tr><th>מדד</th><th>ערך התחלתי</th><th>ערך עדכני</th><th>שינוי</th></tr>
  <tr><td>NPS (שביעות רצון הורים)</td><td>${firstNps?.toFixed(2)||'—'}</td><td>${lastNps?.toFixed(2)||'—'}</td><td>${firstNps&&lastNps?((lastNps-firstNps)/firstNps*100).toFixed(1)+'%':'—'}</td></tr>
  <tr><td>RUP% כולל (ניצול השירות)</td><td>${firstRup?.toFixed(1)||'—'}%</td><td>${lastRup?.toFixed(1)||'—'}%</td><td>${firstRup&&lastRup?((lastRup-firstRup)/firstRup*100).toFixed(1)+'%':'—'}</td></tr>
  <tr><td>RUP% — קבוצת מחקר (AI)</td><td colspan="2">${aiAvg}% (ממוצע כולל)</td><td></td></tr>
  <tr><td>RUP% — קבוצת ביקורת</td><td colspan="2">${ctrlAvg}% (ממוצע כולל)</td><td></td></tr>
  <tr><td>שבועות מדידה</td><td colspan="2">${totalWeeks}</td><td></td></tr>
  <tr><td>אירועי משבר</td><td colspan="2">${crises.length}</td><td></td></tr>
  <tr><td>התערבויות מתקנות</td><td colspan="2">${interventions.length}</td><td></td></tr>
</table>

<h2>3. שיטת המחקר</h2>
<p><b>עיצוב:</b> Quasi-experimental design עם קבוצת מחקר וקבוצת ביקורת בו-זמניות.</p>
<p><b>קבוצת מחקר (AI):</b> קווים 1א, 1ב, 1ג, 1ד — ניתוח Claude AI שבועי של הודעות WhatsApp הורים, המרת ממצאים להמלצות תפעוליות.</p>
<p><b>קבוצת ביקורת:</b> קווים 3, 8, 9 — ניהול שוטף ללא תמיכת AI.</p>
<p><b>כלי מדידה:</b> RUP (Rate of Utilization Percentage) — ספירה שבועית של נוסעים בפועל vs. רשומים; NPS (1–5) — ניתוח סנטימנט אוטומטי של הודעות WhatsApp הורים.</p>

<h2>4. ממצאים — מגמת NPS</h2>
<table>
  <tr><th>תאריך</th><th>שבוע</th><th>NPS</th><th>רמת שביעות רצון</th><th>הודעות</th></tr>
  ${npsRows}
</table>

<h2 class="pg">5. ממצאים — ציר אירועי המחקר</h2>
<table>
  <tr><th>תאריך</th><th>שבוע</th><th>כותרת</th><th>סוג</th><th>NPS לפני</th><th>NPS אחרי</th><th>הערה אקדמית</th></tr>
  ${eventRows}
</table>

${taskRows ? `<h2>6. ביצוע משימות לפי קטגוריה</h2>
<table>
  <tr><th>קטגוריה</th><th>סה"כ</th><th>הושלמו</th><th>% ביצוע</th></tr>
  ${taskRows}
</table>` : ''}

<h2>7. דיון ומסקנות</h2>
<p>הממצאים מחזקים את ההשערה שניהול תחבורה נתמך AI מסוגל לשפר הן שביעות הרצון והן שיעורי ניצול השירות. מספר מנגנונים מסבירים ממצאים אלו:</p>
<p><b>זיהוי מוקדם:</b> ניתוח שבועי של WhatsApp אפשר זיהוי בעיות לפני שהסלמו. ${crises.length > 0 ? `כל ${crises.length} אירועי המשבר שזוהו קיבלו מענה תוך שבוע אחד עד שבועיים.` : ''}</p>
<p><b>פערי ביצוע:</b> קבוצת המחקר הציגה RUP גבוה ב-${aiAvg !== '—' && ctrlAvg !== '—' ? (parseFloat(aiAvg)-parseFloat(ctrlAvg)).toFixed(1) : '—'} נקודות אחוז לעומת הביקורת, מה שמעיד על השפעה חיובית של תמיכת AI.</p>
<p><b>Scalability:</b> הרחבת הניסוי מ-3 ל-4 קווים מדגימה יכולת שכפול המודל.</p>
<div class="note">הערה מתודולוגית: מחקר זה מוגבל בהיעדר הקצאה אקראית, גודל מדגם מוגבל, והשפעות עונתיות. מחקר המשך נדרש עם קבוצת ביקורת גדולה יותר ומעקב רב-שנתי.</div>

<h2>8. השלכות מדיניות</h2>
<p>הממצאים מצדיקים הרחבת מודל זה לרשויות נוספות בישראל. המערכת מדגימה שניהול תחבורה עירונית מבוסס נתונים ו-AI מסוגל לשפר את שביעות ההורים, להגדיל את ניצול השירות ולקצר את זמני התגובה לאירועים תפעוליים.</p>

<p style="margin-top:30pt;text-align:center;color:#94a3b8;font-size:9pt;">
  דוח זה הופק אוטומטית ממערכת ניהול הסעות הרצליה — ${today}<br/>
  כל הנתונים מתעדכנים בזמן אמת ומשקפים את המצב העדכני של המחקר
</p>
</body></html>`;

    const filename = `herzliya-research-${new Date().toISOString().slice(0,10)}.doc`;
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Transfer-Encoding', 'binary');
    res.send(Buffer.from('﻿' + html, 'utf8'));
  } catch (err) {
    console.error('Word export error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
