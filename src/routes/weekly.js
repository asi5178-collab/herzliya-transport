const express = require('express');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(auth);

// המרת מספר שבוע לתאריך ISO (שני של אותו שבוע ISO)
function weekNumToDate(weekNum, year = 2026) {
  // ISO week 1 = השבוע שמכיל את ה-4 בינואר
  const jan4 = new Date(year, 0, 4);
  const monday_w1 = new Date(jan4);
  monday_w1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const result = new Date(monday_w1);
  result.setDate(monday_w1.getDate() + (weekNum - 1) * 7);
  return result.toISOString().split('T')[0];
}

// קבלת נתוני RUP
router.get('/ridership', (req, res) => {
  try {
    const db = getDb();
    const { week_date, line_id, week_number } = req.query;
    let sql = `SELECT wr.*, l.name as line_name, l.code as line_code
               FROM weekly_ridership wr JOIN lines l ON wr.line_id = l.id
               WHERE wr.week_number IS NOT NULL`;
    const params = [];
    if (week_date)   { sql += ' AND wr.week_date = ?';   params.push(week_date); }
    if (week_number) { sql += ' AND wr.week_number = ?'; params.push(parseInt(week_number)); }
    if (line_id)     { sql += ' AND wr.line_id = ?';     params.push(parseInt(line_id)); }
    sql += ' ORDER BY wr.week_number DESC, wr.week_date DESC, l.code';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// הוספה / עדכון נתוני נסיעה — מספר שבוע מספיק
router.post('/ridership', requireRole('admin'), (req, res) => {
  try {
    let { week_date, week_number, line_id, actual_riders, registered_students, capacity, notes } = req.body;

    if (!line_id)   return res.status(400).json({ error: 'חסר קו' });
    if (actual_riders === undefined || actual_riders === null || actual_riders === '')
                    return res.status(400).json({ error: 'חסר מספר נוסעים' });

    // אם אין תאריך — מחשב ממספר השבוע
    if (!week_date && week_number) {
      week_date = weekNumToDate(parseInt(week_number));
    }
    if (!week_date) return res.status(400).json({ error: 'חסר תאריך או מספר שבוע' });

    const db = getDb();
    const actual  = parseInt(actual_riders) || 0;
    const lineRow = db.prepare('SELECT * FROM lines WHERE id = ?').get(parseInt(line_id));
    if (!lineRow) return res.status(400).json({ error: `קו ${line_id} לא נמצא` });

    // registered: מהטופס → מהשבוע האחרון של אותו קו → 1
    let registered = parseInt(registered_students) || 0;
    if (!registered) {
      const prev = db.prepare(
        'SELECT registered_students FROM weekly_ridership WHERE line_id = ? AND registered_students > 0 ORDER BY week_date DESC LIMIT 1'
      ).get(parseInt(line_id));
      registered = prev?.registered_students || 1;
    }

    const cap = parseInt(capacity) || lineRow.capacity || 18;
    const rup = registered > 0 ? ((actual / registered) * 100).toFixed(2) : '0.00';
    const wNum = week_number ? parseInt(week_number) : null;

    // UPDATE אם קיים, אחרת INSERT
    const existing = db.prepare('SELECT id FROM weekly_ridership WHERE week_date = ? AND line_id = ?')
      .get(week_date, parseInt(line_id));

    if (existing) {
      db.prepare(`UPDATE weekly_ridership
        SET actual_riders=?, registered_students=?, rup_percent=?, capacity=?,
            week_number=?, notes=?
        WHERE week_date=? AND line_id=?`
      ).run(actual, registered, rup, cap, wNum, notes||null, week_date, parseInt(line_id));
    } else {
      db.prepare(`INSERT INTO weekly_ridership
        (week_date, week_number, line_id, actual_riders, registered_students, rup_percent, capacity, notes)
        VALUES (?,?,?,?,?,?,?,?)`
      ).run(week_date, wNum, parseInt(line_id), actual, registered, rup, cap, notes||null);
    }

    res.json({ success: true, rup_percent: rup, actual, registered, week_date });
  } catch (err) {
    console.error('weekly POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// מחיקת שורה בודדת (לפי id)
router.delete('/ridership/:id', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM weekly_ridership WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true, deleted: result.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// מחיקת כל שורות של שבוע מסוים (לפי week_number)
router.delete('/ridership/week/:weekNum', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM weekly_ridership WHERE week_number = ?').run(parseInt(req.params.weekNum));
    // גם מחק ניתוח WhatsApp של אותו שבוע
    db.prepare('DELETE FROM whatsapp_messages WHERE week_number = ?').run(parseInt(req.params.weekNum));
    res.json({ success: true, deleted: result.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ניתוחים שבועיים (רק אלה שיש להם NPS)
router.get('/analysis', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(`
      SELECT * FROM weekly_analysis WHERE nps_score IS NOT NULL
      ORDER BY week_date DESC
    `).all().map(a => ({
      ...a,
      positive_themes: JSON.parse(a.positive_themes || '[]'),
      negative_themes: JSON.parse(a.negative_themes || '[]'),
      recommendations: JSON.parse(a.recommendations || '[]'),
      tasks: JSON.parse(a.tasks || '[]')
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// שבועות זמינים
router.get('/weeks', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(
      'SELECT DISTINCT week_number, week_date FROM weekly_ridership WHERE week_number IS NOT NULL ORDER BY week_number DESC'
    ).all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
