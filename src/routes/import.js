const express = require('express');
const multer = require('multer');
const path = require('path');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');
const { parseExcel, parseCSV } = require('../services/importService');

const router = express.Router();
router.use(auth, requireRole('admin', 'manager'));

const upload = multer({
  dest: './data/raw/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('רק קבצי Excel ו-CSV מותרים'));
  }
});

// ייבוא נתוני נסיעה (RUP)
router.post('/ridership', upload.single('file'), async (req, res) => {
  const { week_date, week_number } = req.body;
  if (!week_date) return res.status(400).json({ error: 'תאריך שבוע חובה' });
  try {
    const db = getDb();
    let records = [];
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      records = ext === '.csv' ? await parseCSV(req.file.path) : await parseExcel(req.file.path);
    } else if (req.body.data) {
      records = JSON.parse(req.body.data);
    } else {
      return res.status(400).json({ error: 'נדרש קובץ או נתונים' });
    }
    let imported = 0;
    const insert = db.prepare(`INSERT OR REPLACE INTO weekly_ridership (week_date, week_number, line_id, actual_riders, registered_students, rup_percent, capacity, source_file, created_by) VALUES (?,?,?,?,?,?,?,?,?)`);
    db.transaction((recs) => {
      for (const r of recs) {
        const line = db.prepare("SELECT id, capacity FROM lines WHERE code = ?").get(r.line_code || r.line_id);
        if (!line) continue;
        const registered = r.registered_students || db.prepare('SELECT COUNT(*) as c FROM students WHERE line_id = ? AND is_active = 1').get(line.id)?.c || 1;
        const rup = ((r.actual_riders / registered) * 100).toFixed(2);
        insert.run(week_date, week_number, line.id, r.actual_riders, registered, rup, r.capacity || line.capacity, req.file?.originalname, req.user.id);
        imported++;
      }
    })(records);
    db.prepare("INSERT INTO import_log (type, file_name, week_date, records_count, imported_by) VALUES ('ridership',?,?,?,?)").run(req.file?.originalname, week_date, imported, req.user.id);
    res.json({ success: true, imported });
  } catch (err) {
    res.status(500).json({ error: `שגיאה בייבוא: ${err.message}` });
  }
});

// ייבוא הודעות WhatsApp
router.post('/whatsapp', (req, res) => {
  const { week_date, week_number, text, line_id, parent_group_id } = req.body;
  if (!week_date || !text) return res.status(400).json({ error: 'תאריך ותוכן הנדרשים' });
  const db = getDb();
  const messages = parseWhatsAppText(text, week_date, week_number, line_id, parent_group_id);
  if (!messages.length) return res.status(400).json({ error: 'לא נמצאו הודעות תקינות בטקסט' });
  const insert = db.prepare(`INSERT INTO whatsapp_messages (week_date, week_number, parent_group_id, line_id, message_date, sender_name, message_text) VALUES (?,?,?,?,?,?,?)`);
  db.transaction((msgs) => { for (const m of msgs) insert.run(m.week_date, m.week_number, m.parent_group_id, m.line_id, m.date, m.sender, m.text); })(messages);
  db.prepare("INSERT INTO import_log (type, week_date, records_count, imported_by) VALUES ('whatsapp',?,?,?)").run(week_date, messages.length, req.user.id);
  res.json({ success: true, imported: messages.length, sample: messages.slice(0, 3) });
});

// לוג ייבוא
router.get('/log', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT il.*, u.full_name as imported_by_name FROM import_log il LEFT JOIN users u ON il.imported_by = u.id ORDER BY il.created_at DESC LIMIT 50`).all());
});

// =====================================================================
// פרסר WhatsApp - תומך בכל הפורמטים (iPhone / Android / ישן)
// =====================================================================
function parseWhatsAppText(text, week_date, week_number, line_id, parent_group_id) {
  const cleaned = text.replace(/[\u200E\u200F\u202A\u202B\u202C\u202D\u202E﻿­​‌‍]/g, '')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // iPhone: [D/M/YYYY ,HH:MM] or [D/M/YYYY, HH:MM:SS]
  const patA = /^\[(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})[\s,،]+(\d{1,2}:\d{2}(?::\d{2})?)\s*\]\s*([^:]+?)\s*:\s*(.+)$/;
  // Android: D/M/YYYY, HH:MM - Name: message
  const patB = /^(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})[,،\s]+(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*([^:]+?):\s*(.+)$/;
  // גמיש: כל מה שבתוך []
  const patC = /^\[([^\]]+)\]\s*([^:]+?)\s*:\s*(.+)$/;

  const SKIP = ['הצטרף','הצטרפה','נוצרה','הפעיל','שינה','הוסיף','הסיר','omitted'];

  function smartDate(s) {
    const sep = s.includes('/') ? '/' : s.includes('.') ? '.' : '-';
    const p = s.split(sep).map(Number);
    const [a, b, y] = p;
    const year = y < 100 ? 2000 + y : y;
    let day = a, month = b;
    if (b > 12 && a <= 12) { month = a; day = b; }
    else if (a > 12 && b <= 12) { day = a; month = b; }
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  const messages = [];
  for (const line of cleaned.split('\n')) {
    const raw = line.trim();
    if (!raw || raw.length < 3) continue;

    let m = raw.match(patA) || raw.match(patB);
    if (m) {
      const [, date, time, sender, txt] = m;
      const t = txt.trim();
      if (!t || t.length < 2 || SKIP.some(s => t.includes(s) || sender.includes(s))) continue;
      messages.push({ week_date, week_number, parent_group_id: parent_group_id||null, line_id: line_id||null, date: smartDate(date), time: time.slice(0,5), sender: sender.trim(), text: t });
      continue;
    }
    const mc = raw.match(patC);
    if (mc) {
      const dtm = mc[1].match(/(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})[\s,،]+(\d{1,2}:\d{2})/);
      if (dtm) {
        const t = mc[3].trim();
        if (t && t.length >= 2 && !SKIP.some(s => t.includes(s)))
          messages.push({ week_date, week_number, parent_group_id: parent_group_id||null, line_id: line_id||null, date: smartDate(dtm[1]), time: dtm[2], sender: mc[2].trim(), text: t });
        continue;
      }
    }
    if (messages.length > 0 && !SKIP.some(s => raw.includes(s)))
      messages[messages.length-1].text += ' ' + raw;
  }
  return messages;
}

module.exports = router;
