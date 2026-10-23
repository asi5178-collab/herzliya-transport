require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');
const fs = require('fs');

// אתחול DB בהפעלה ראשונה
const { initDatabase } = require('./database/init');
try { initDatabase(); } catch (e) { console.error('DB init error:', e.message); }

// מיגרציות — הוספת עמודות חדשות לטבלאות קיימות
const Database = require('./database/sqlite-compat');
try {
  const _mdb = new Database(process.env.DB_PATH || './database/herzliya.db');
  const migrations = [
    "ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT 'שיפור'",
    "ALTER TABLE tasks ADD COLUMN stakeholder TEXT DEFAULT 'מנהל הסעות'",
    "ALTER TABLE tasks ADD COLUMN week_number INTEGER",
    "ALTER TABLE lines ADD COLUMN ai_enabled INTEGER DEFAULT 1",
    "ALTER TABLE lines ADD COLUMN route_type TEXT DEFAULT 'regular'",
    "ALTER TABLE lines ADD COLUMN school_from TEXT",
    "ALTER TABLE lines ADD COLUMN school_to TEXT",
    "ALTER TABLE tasks ADD COLUMN completion_note TEXT",
    "ALTER TABLE weekly_ridership ADD COLUMN cancelled INTEGER DEFAULT 0",
    "DELETE FROM lines WHERE code IN ('17A','17B','17C')",
    "INSERT OR IGNORE INTO lines (name,code,description,capacity,vehicle_type,waypoints,zone_ids,status,ai_enabled,route_type,school_from,school_to) VALUES ('קו 1 7ד','1D','קו מחקר — ניסוי עם AI — אולפנת צביה',18,'minibus','[]','[]','active',1,'regular','אולפנת צביה',null)",
    `CREATE TABLE IF NOT EXISTS research_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_date DATE NOT NULL,
      week_number INTEGER,
      event_type TEXT NOT NULL DEFAULT 'milestone',
      title TEXT NOT NULL,
      description TEXT,
      lines_affected TEXT DEFAULT '[]',
      metric_before TEXT,
      metric_after TEXT,
      impact_note TEXT,
      source TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS student_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_date DATE NOT NULL,
      week_number INTEGER,
      source_group TEXT DEFAULT 'קבוצת תלמידים',
      satisfaction_score REAL,
      satisfaction_level TEXT,
      positive_themes TEXT,
      negative_themes TEXT,
      student_insights TEXT,
      recommendations TEXT,
      tasks TEXT,
      summary_hebrew TEXT,
      raw_analysis TEXT,
      message_count INTEGER DEFAULT 0,
      model_used TEXT DEFAULT 'claude-sonnet-4-6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(week_date)
    )`
  ];
  for (const sql of migrations) { try { _mdb.exec(sql); } catch {} }

  // עדכון שמות וסטטוס קווי מחקר — exec עם SQL מוטבע (ללא binding, אמין ב-node:sqlite)
  const lineFixSql = [
    "UPDATE lines SET name='קו 1 7א', ai_enabled=1, status='active' WHERE code='1A'",
    "UPDATE lines SET name='קו 1 7ב', ai_enabled=1, status='active' WHERE code='1B'",
    "UPDATE lines SET name='קו 1 7ג', ai_enabled=1, status='active' WHERE code='1C'",
    "UPDATE lines SET name='קו 1 7ד', ai_enabled=1, status='active' WHERE code='1D'",
    "UPDATE weekly_ridership SET cancelled=1 WHERE notes='בוטל'",
  ];
  for (const sql of lineFixSql) { try { _mdb.exec(sql); console.log('Line fix OK:', sql.substring(25, 50)); } catch (e) { console.error('Line fix error:', e.message); } }

  // זריעת אירועי מחקר בסיסיים (INSERT OR IGNORE — לא ידרסו נתונים קיימים)
  const researchEventsSql = [
    "INSERT OR IGNORE INTO research_events (id,event_date,week_number,event_type,title,description,lines_affected,impact_note,source) VALUES (1,'2026-04-28',18,'milestone','השקת ניסוי — פיילוט ראשון של המערכת','הפעלת מערכת ניהול הסעות נתמכת בינה מלאכותית. שלושה קווי מחקר (1א,1ב,1ג) ושלושה קווי ביקורת (3,8,9). ניצול ראשוני: 3-13%.','[\"1A\",\"1B\",\"1C\"]','נקודת ה-Baseline של המחקר — ממוצע RUP ראשוני נמוך מהצפוי, מצביע על עיכוב אימוץ טיפוסי במערכות תחבורה חדשות.','auto')",
    "INSERT OR IGNORE INTO research_events (id,event_date,week_number,event_type,title,description,lines_affected,metric_before,metric_after,impact_note,source) VALUES (2,'2026-05-12',20,'system_change','הרחבת קיבולת — מעבר ממינבוס לאוטובוס','בעקבות ניתוח WhatsApp ש-NPS עלה ל-4.33 (good) ודרישה גוברת — הוחלפו כלי רכב מ-18 מקומות ל-50 מקומות. שיפור מיידי בשביעות הרצון.','[\"1A\",\"1B\",\"1C\"]','{\"nps\":3.73,\"rup\":11.3}','{\"nps\":4.33,\"rup\":12.7}','אינטרוונציה ראשונה מבוססת נתוני AI — הדגמת יכולת המערכת לזהות בעיות קיבולת ולהפעיל שינוי תפעולי בתוך שבועיים.','auto')",
    "INSERT OR IGNORE INTO research_events (id,event_date,week_number,event_type,title,description,lines_affected,metric_before,metric_after,impact_note,source) VALUES (3,'2026-05-19',21,'crisis','משבר עומס — ירידה חדה בשביעות רצון','אירוע עומס חמור: צפיפות גבוהה, סתירות בספירת נוסעים, תלונות הורים ותלמידים. NPS צנח ל-2.93 (critical). סריקות QR לא פעלו כהלכה.','[\"1A\",\"1B\",\"1C\"]','{\"nps\":4.33,\"rup\":12.7}','{\"nps\":2.93,\"rup\":10.1}','נקודת משבר קריטית — מדגישה את הצורך בגמישות תפעולית ובמנגנוני תגובה מהירה. ירידה של 32% ב-NPS תוך שבוע אחד.','auto')",
    "INSERT OR IGNORE INTO research_events (id,event_date,week_number,event_type,title,description,lines_affected,metric_before,metric_after,impact_note,source) VALUES (4,'2026-05-26',22,'intervention','פעולה מתקנת — קנס + תוכנית שיפור','הטלת קנס על חברת ההסעות. גיבוש תוכנית ספטמבר עם 3 אוטובוסים. שיפור מנגנוני דיווח. NPS עלה חזרה ל-3.20.','[\"1A\",\"1B\",\"1C\"]','{\"nps\":2.93,\"rup\":10.1}','{\"nps\":3.20,\"rup\":12.0}','מדגים את יכולת המערכת לזהות ולתקן תקלות — זמן תגובה של שבוע אחד בין זיהוי המשבר להפעלת פתרון.','auto')",
    "INSERT OR IGNORE INTO research_events (id,event_date,week_number,event_type,title,description,lines_affected,impact_note,source) VALUES (5,'2026-08-31',36,'external_factor','תחילת שנת הלימודים תשפ\"ז — חזרה מחופש קיץ','חזרה לפעילות מלאה לאחר הפסקת קיץ. RUP עלה ל-9-27% — גידול משמעותי לעומת ממוצע השנה הקודמת, מעיד על אימוץ הולך וגדל של השירות.','[\"1A\",\"1B\",\"1C\"]','תחילת שנה מהווה נקודת מדידה קריטית — עלייה ב-RUP מ-12% (W22) ל-27% (W36) מצביעה על גידול של 125% בניצול לאורך הקיץ.','auto')",
    "INSERT OR IGNORE INTO research_events (id,event_date,week_number,event_type,title,description,lines_affected,impact_note,source) VALUES (6,'2026-10-23',43,'expansion','הרחבת הניסוי — קו 1 7ד, אולפנת צביה','הוספת קו מחקר רביעי (1D) — הרחבת הניסוי לאולפנת צביה. מהווה ראיה לדופוסי שכפול ולהרחבת המערכת לבתי ספר נוספים.','[\"1D\"]','שלב ההרחבה (Scale-up) — מעבר מניסוי ב-3 קווים ל-4 קווים מדגים scalability של הפלטפורם ואפשרות לשכפולה בערים נוספות.','auto')",
  ];
  for (const sql of researchEventsSql) { try { _mdb.exec(sql); } catch {} }

  _mdb.close();
} catch (e) { console.error('Migration error:', e.message); }

// זריעת נתוני ברירת מחדל אם DB ריק
const { seedIfEmpty } = require('./database/seed');
try { seedIfEmpty(); } catch (e) { console.error('Seed error:', e.message); }

const app = express();

// אבטחה
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));

// הגבלת קצב
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 2000 }));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// קבצים סטטיים
app.use(express.static(path.join(__dirname, 'frontend')));

// נתיבי API
app.use('/api/auth', require('./src/auth/routes'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/zones', require('./src/routes/zones'));
app.use('/api/students', require('./src/routes/students'));
app.use('/api/lines', require('./src/routes/lines'));
app.use('/api/weekly', require('./src/routes/weekly'));
app.use('/api/analysis', require('./src/routes/analysis'));
app.use('/api/import', require('./src/routes/import'));
app.use('/api/tasks', require('./src/routes/tasks'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/reports', require('./src/routes/reports'));
app.use('/api/student-analysis', require('./src/routes/student-analysis'));
app.use('/api/backup', require('./src/routes/backup'));
app.use('/api/research-events', require('./src/routes/research-events'));
app.use('/api/v1', require('./src/routes/api-v1'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    version: '1.0.0',
    api_key_set: !!process.env.ANTHROPIC_API_KEY,
    api_key_prefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...' : 'NOT SET'
  });
});

// כל שאר הנתיבים - הגש frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// טיפול בשגיאות
app.use((err, req, res, next) => {
  console.error('שגיאת שרת:', err.message);
  res.status(500).json({ error: 'שגיאת שרת פנימית' });
});

const PORT = parseInt(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  console.log('\n' + '='.repeat(55));
  console.log('  🚌  מערכת הסעות תיכונים - עיריית הרצליה  🚌');
  console.log('='.repeat(55));
  console.log(`  📍 מקומי:   http://localhost:${PORT}`);
  console.log(`  🌐 רשת:     http://${localIP}:${PORT}`);
  console.log(`  📅 תאריך:   ${new Date().toLocaleDateString('he-IL')}`);
  console.log('='.repeat(55));
  console.log('  משתמשים:');
  console.log('  admin / admin123  (מנהל מלא)');
  console.log('  viewer / viewer123  (צפייה בלבד)');
  console.log('='.repeat(55) + '\n');
});

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
