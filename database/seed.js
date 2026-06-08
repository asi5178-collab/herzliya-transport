require('dotenv').config();
const Database = require('./sqlite-compat');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './database/herzliya.db';

function seedIfEmpty() {
  const db = new Database(DB_PATH);
  try {
    const existing = db.prepare('SELECT COUNT(*) as c FROM users').get();
    if (existing && existing.c > 0) {
      console.log('[OK] Seed skipped — users already exist');
      return;
    }
    doSeed(db);
  } finally {
    db.close();
  }
}

function doSeed(db) {
  const run = db.transaction(() => {

    // Users
    const users = [
      { username: 'admin',  password: 'admin123',  full_name: 'מנהל מערכת', role: 'admin' },
      { username: 'viewer', password: 'viewer123', full_name: 'צופה',        role: 'viewer' }
    ];
    const insertUser = db.prepare(`INSERT OR IGNORE INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)`);
    for (const u of users) insertUser.run(u.username, bcrypt.hashSync(u.password, 10), u.full_name, u.role);

    // Schools
    const schools = [
      { name: 'תיכון עירוני חדש', short_name: 'עירוני',    total: 337, transport: 320 },
      { name: 'תיכון יובל',       short_name: 'יובל',      total: 82,  transport: 78  },
      { name: 'תיכון ראשון',      short_name: 'ראשון',     total: 77,  transport: 73  },
      { name: 'תיכון הנדסאים',    short_name: 'הנדסאים',   total: 73,  transport: 70  },
      { name: 'תיכון סמיר',       short_name: 'סמיר',      total: 138, transport: 143 }
    ];
    const insertSchool = db.prepare(`INSERT OR IGNORE INTO schools (name, short_name, total_students, transport_students) VALUES (?,?,?,?)`);
    for (const s of schools) insertSchool.run(s.name, s.short_name, s.total, s.transport);

    // Zones
    const zones = [
      { name: 'מרינה',          code: 'MARINA',       lat: 32.1650, lng: 34.7950, color: '#3B82F6' },
      { name: 'נוף ים',         code: 'NOF_YAM',      lat: 32.1580, lng: 34.7880, color: '#10B981' },
      { name: 'הרצליה פיתוח',  code: 'HERZLIYA_PIT', lat: 32.1620, lng: 34.8050, color: '#F59E0B' },
      { name: "הרצליה ב'",     code: 'HERZLIYA_B',   lat: 32.1700, lng: 34.8200, color: '#EF4444' },
      { name: 'אזור תעשייה',   code: 'INDUSTRIAL',   lat: 32.1550, lng: 34.8150, color: '#8B5CF6' }
    ];
    const insertZone = db.prepare(`INSERT OR IGNORE INTO zones (name, code, latitude, longitude, color) VALUES (?,?,?,?,?)`);
    for (const z of zones) insertZone.run(z.name, z.code, z.lat, z.lng, z.color);

    // Lines
    const wp1A = JSON.stringify([
      { order: 1, lat: 32.165, lng: 34.795, label: 'תחנת מרינה',   time: '07:15' },
      { order: 2, lat: 32.158, lng: 34.788, label: 'תחנת נוף ים',  time: '07:22' },
      { order: 3, lat: 32.162, lng: 34.805, label: 'תיכון עירוני', time: '07:35' }
    ]);
    const wp1B = JSON.stringify([
      { order: 1, lat: 32.162, lng: 34.805, label: 'תחנת פיתוח',       time: '07:10' },
      { order: 2, lat: 32.170, lng: 34.820, label: "תחנת הרצליה ב'",   time: '07:20' },
      { order: 3, lat: 32.162, lng: 34.805, label: 'תיכון עירוני',      time: '07:35' }
    ]);
    const insertLine = db.prepare(`INSERT OR IGNORE INTO lines (name, code, description, capacity, vehicle_type, waypoints, zone_ids, status) VALUES (?,?,?,?,?,?,?,?)`);
    insertLine.run('קו 1א', '1A', 'קו ראשי - מרינה ונוף ים',    18, 'minibus', wp1A, JSON.stringify([1,2]), 'active');
    insertLine.run('קו 1ב', '1B', 'קו משני - הרצליה פיתוח',      18, 'minibus', wp1B, JSON.stringify([3,4]), 'active');
    insertLine.run('קו 1ג', '1C', 'קו מתוכנן - אזור תעשייה',     50, 'bus',     JSON.stringify([]), JSON.stringify([5]), 'planned');

    // Parent groups
    const insertGroup = db.prepare(`INSERT OR IGNORE INTO parent_groups (name, line_id, member_count) VALUES (?,?,?)`);
    insertGroup.run('הורי קו 1א - WhatsApp', 1, 35);
    insertGroup.run('הורי קו 1ב - WhatsApp', 2, 28);

    // Weekly RUP data
    const rupRows = [
      { week: '2026-04-28', num: 18, line: 1, reg: 478, actual: 13, cap: 18 },
      { week: '2026-04-28', num: 18, line: 2, reg: 203, actual: 27, cap: 18 },
      { week: '2026-05-05', num: 19, line: 1, reg: 478, actual: 17, cap: 18 },
      { week: '2026-05-05', num: 19, line: 2, reg: 203, actual: 23, cap: 18 },
      { week: '2026-05-12', num: 20, line: 1, reg: 478, actual: 22, cap: 50 },
      { week: '2026-05-12', num: 20, line: 2, reg: 203, actual: 30, cap: 50 },
      { week: '2026-05-19', num: 21, line: 1, reg: 478, actual: 19, cap: 50 },
      { week: '2026-05-19', num: 21, line: 2, reg: 203, actual: 28, cap: 50 },
      { week: '2026-05-26', num: 22, line: 1, reg: 478, actual: 12, cap: 50 },
      { week: '2026-05-26', num: 22, line: 2, reg: 203, actual: 24, cap: 50 }
    ];
    const insertRup = db.prepare(`INSERT OR REPLACE INTO weekly_ridership (week_date, week_number, line_id, registered_students, actual_riders, rup_percent, capacity) VALUES (?,?,?,?,?,?,?)`);
    for (const r of rupRows) {
      insertRup.run(r.week, r.num, r.line, r.reg, r.actual, ((r.actual / r.reg) * 100).toFixed(2), r.cap);
    }

    // Weekly analysis
    const analyses = [
      { week: '2026-04-28', num: 18, nps: 3.10, level: 'developing',
        pos: JSON.stringify(['קיום שירות','נהג אדיב','שיתוף פעולה תלמידים']),
        neg: JSON.stringify(['בלבול בתחנות','מידע חלקי על מסלולים']),
        recs: JSON.stringify(['שליחת מפת תחנות','הסבר מסלול מפורט','מינוי רכז תלמיד']),
        tasks: JSON.stringify([{title:'שליחת מפת תחנות להורים',priority:'high',deadline:'2026-05-04'},{title:'מינוי רכזי תלמידים',priority:'high',deadline:'2026-05-04'}]),
        summary: 'שבוע פיילוט ראשון. הורים מבולבלים לגבי תחנות ומסלולים. יש עניין בשירות.', count: 24 },
      { week: '2026-05-05', num: 19, nps: 3.73, level: 'developing',
        pos: JSON.stringify(['שיפור ניכר','תכנית תמריצים','קוד QR']),
        neg: JSON.stringify(['מידע חסר על תחנות','אי-ודאות לגבי שינויים']),
        recs: JSON.stringify(['שיפור תקשורת שינויים','הרחבת תמריצים','עדכון מסלול']),
        tasks: JSON.stringify([{title:'עדכון ויזואלי של מפת תחנות',priority:'medium',deadline:'2026-05-11'}]),
        summary: 'שיפור בשביעות הרצון. קוד QR ותמריצים מעניינים הורים ותלמידים.', count: 31 },
      { week: '2026-05-12', num: 20, nps: 4.33, level: 'good',
        pos: JSON.stringify(['מיניבוס כמעט מלא','רכזי תלמידים','שביעות רצון גבוהה','הרחבה לאוטובוס']),
        neg: JSON.stringify(['עומס עתידי צפוי','ניהול תחנות']),
        recs: JSON.stringify(['שמירת איכות השירות','הכנה להרחבה לאוטובוס','חיזוק מעמד הרכזים']),
        tasks: JSON.stringify([{title:'הכנת תכנית הרחבה לאוטובוס',priority:'high',deadline:'2026-05-20'}]),
        summary: 'שיא עד כה. שירות מלא, הורים מרוצים. הרחבה לאוטובוס מאושרת.', count: 28 },
      { week: '2026-05-19', num: 21, nps: 2.93, level: 'critical',
        pos: JSON.stringify(['מחויבות לשיפור','תגובת הנהלה מהירה']),
        neg: JSON.stringify(['עומס וצפיפות','אי-עמידה בסריקות QR','סתירות בנתונים','בקשות לרכב גדול']),
        recs: JSON.stringify(['הגדלת קיבולת דחופה','בדיקת נתוני נהג מול דיווח תלמידים','מענה לתלמידי סמיר']),
        tasks: JSON.stringify([{title:'מעבר דחוף לאוטובוס גדול',priority:'high',deadline:'2026-05-25'},{title:'בדיקת פערי נתוני נסיעה',priority:'high',deadline:'2026-05-22'}]),
        summary: 'ירידה חדה בשביעות רצון. עומס, סתירות בנתונים ובעיות קיבולת. נדרשת פעולה מיידית.', count: 42 },
      { week: '2026-05-26', num: 22, nps: 3.20, level: 'developing',
        pos: JSON.stringify(['שיקום שירות','תכנית ספטמבר עם 3 אוטובוסים','קנס לחברה']),
        neg: JSON.stringify(['תקלות GPS','מחלוקות ספירת נוסעים','אירוע איחור חמור']),
        recs: JSON.stringify(['תכנון מסלולי ספטמבר','הטמעת GPS מהיר','ייצוב תקשורת עם הורים']),
        tasks: JSON.stringify([{title:'תכנון 3 קווים לספטמבר',priority:'high',deadline:'2026-06-15'},{title:'הטמעת מערכת GPS',priority:'medium',deadline:'2026-07-01'}]),
        summary: 'התייצבות חלקית לאחר משבר שבוע 21. תכנית ספטמבר בגיבוש עם 3 אוטובוסים.', count: 38 }
    ];
    const insertAnalysis = db.prepare(`INSERT OR REPLACE INTO weekly_analysis (week_date, week_number, nps_score, satisfaction_level, positive_themes, negative_themes, recommendations, tasks, summary_hebrew, message_count) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const a of analyses) insertAnalysis.run(a.week, a.num, a.nps, a.level, a.pos, a.neg, a.recs, a.tasks, a.summary, a.count);

    // Sample tasks
    const insertTask = db.prepare(`INSERT OR IGNORE INTO tasks (title, priority, status, week_date, source) VALUES (?,?,?,?,?)`);
    insertTask.run('תכנון 3 קווים לספטמבר 2026', 'high', 'open', '2026-05-26', 'analysis');
    insertTask.run('הטמעת מערכת GPS לרכבים', 'medium', 'open', '2026-05-26', 'analysis');
    insertTask.run('ייצוב תקשורת עם הורים', 'medium', 'in_progress', '2026-05-26', 'analysis');

    // Sample students
    const insertStudent = db.prepare(`INSERT OR IGNORE INTO students (name, school_id, zone_id, line_id, address, latitude, longitude, parent_name, has_app) VALUES (?,?,?,?,?,?,?,?,?)`);
    const students = [
      ['דניאל כהן',    1, 1, 1, 'רחוב הים 12, מרינה',      32.1645, 34.7945, 'שרה כהן',     1],
      ['מיכל לוי',     1, 1, 1, 'שדרות הנשיא 5, מרינה',    32.1660, 34.7960, 'רחל לוי',     1],
      ['עמית גרין',    2, 2, 1, 'רחוב נוף ים 8',            32.1575, 34.7875, 'דוד גרין',    0],
      ['נועה בן-דוד',  1, 3, 2, 'שדרות רוטשילד 22',         32.1625, 34.8055, 'יעל בן-דוד',  1],
      ['אלון שמיר',    3, 4, 2, 'רחוב ויצמן 15',            32.1705, 34.8205, 'גיל שמיר',    1],
      ['שיר אברהם',    2, 2, 1, 'שדרות כצנלסון 3',          32.1590, 34.7890, 'אורית אברהם', 0],
      ['יובל מזרחי',   4, 3, 2, 'רחוב הרב קוק 7',           32.1615, 34.8045, 'מרים מזרחי',  1],
      ['תמר חדד',      1, 1, 1, 'רחוב הדולפין 2',           32.1655, 34.7955, 'נאוה חדד',    1],
      ['רן פרידמן',    3, 4, 2, 'שדרות בן גוריון 44',       32.1710, 34.8195, 'אבי פרידמן',  0],
      ['גלית אוחיון',  1, 2, 1, 'רחוב נוף הים 11',          32.1585, 34.7885, 'אסתר אוחיון', 1]
    ];
    for (const s of students) insertStudent.run(...s);

    console.log('[OK] Sample data seeded successfully');
  });

  try {
    run();
    console.log('[OK] Seed complete');
  } catch (err) {
    console.error('[ERROR] Seed failed:', err.message);
    throw err;
  }
}

module.exports = { seedIfEmpty };

if (require.main === module) {
  const db = new Database(DB_PATH);
  try {
    doSeed(db);
  } finally {
    db.close();
  }
}
