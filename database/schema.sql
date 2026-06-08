-- סכמת בסיס נתונים - מערכת הסעות הרצליה

-- משתמשי המערכת
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',  -- admin | manager | viewer
  email TEXT,
  is_active INTEGER DEFAULT 1,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- בתי ספר
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  short_name TEXT,
  total_students INTEGER DEFAULT 0,
  transport_students INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

-- אזורים גיאוגרפיים (שכונות)
CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  latitude REAL,
  longitude REAL,
  color TEXT DEFAULT '#3B82F6',
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- קווי הסעה
CREATE TABLE IF NOT EXISTS lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,   -- 1A, 1B, 1C
  description TEXT,
  capacity INTEGER DEFAULT 18,
  vehicle_type TEXT DEFAULT 'minibus',  -- minibus | bus
  waypoints TEXT,              -- JSON: [{lat, lng, label, order}]
  zone_ids TEXT,               -- JSON array of zone IDs
  status TEXT DEFAULT 'active', -- active | planned | suspended
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- תלמידים
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  student_id TEXT,
  school_id INTEGER REFERENCES schools(id),
  zone_id INTEGER REFERENCES zones(id),
  line_id INTEGER REFERENCES lines(id),
  address TEXT,
  latitude REAL,
  longitude REAL,
  parent_name TEXT,
  parent_phone TEXT,
  has_app INTEGER DEFAULT 0,   -- האם יש לו אפליקציית SchoolRide
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- קבוצות WhatsApp של הורים
CREATE TABLE IF NOT EXISTS parent_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  line_id INTEGER REFERENCES lines(id),
  zone_id INTEGER REFERENCES zones(id),
  member_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- נסיעות שבועיות - מדד RUP
CREATE TABLE IF NOT EXISTS weekly_ridership (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_date DATE NOT NULL,
  week_number INTEGER,
  line_id INTEGER REFERENCES lines(id),
  registered_students INTEGER DEFAULT 0,
  actual_riders INTEGER DEFAULT 0,
  rup_percent REAL DEFAULT 0,
  capacity INTEGER DEFAULT 18,
  source_file TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(week_date, line_id)
);

-- הודעות WhatsApp שיובאו
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_date DATE NOT NULL,
  week_number INTEGER,
  parent_group_id INTEGER REFERENCES parent_groups(id),
  line_id INTEGER REFERENCES lines(id),
  message_date DATE,
  message_time TEXT,
  sender_name TEXT,
  message_text TEXT NOT NULL,
  sentiment TEXT,   -- positive | negative | neutral
  category TEXT,    -- capacity | timing | info | praise | complaint | safety
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- תוצאות ניתוח שבועי (Claude)
CREATE TABLE IF NOT EXISTS weekly_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_date DATE NOT NULL UNIQUE,
  week_number INTEGER,
  nps_score REAL,              -- 1.0 - 5.0
  satisfaction_level TEXT,     -- critical | developing | good | excellent
  positive_themes TEXT,        -- JSON: ["נהג אדיב", "שירות קבוע"]
  negative_themes TEXT,        -- JSON: ["עומס", "בלבול בתחנות"]
  recommendations TEXT,        -- JSON: ["להגדיל קיבולת", "לשלוח מפת תחנות"]
  tasks TEXT,                  -- JSON: [{title, priority, deadline}]
  summary_hebrew TEXT,         -- סיכום קצר בעברית
  raw_analysis TEXT,           -- תגובת Claude המלאה
  message_count INTEGER DEFAULT 0,
  model_used TEXT DEFAULT 'claude-sonnet-4-6',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- משימות פעילות
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_date DATE,
  week_number INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',   -- high | medium | low
  status TEXT DEFAULT 'open',       -- open | in_progress | done
  category TEXT DEFAULT 'שיפור',    -- שיפור | שימור | ביצוע
  stakeholder TEXT DEFAULT 'מנהל הסעות',
  assignee TEXT,
  deadline DATE,
  source TEXT DEFAULT 'analysis',   -- analysis | manual
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- לוג ייבוא
CREATE TABLE IF NOT EXISTS import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,         -- ridership | whatsapp
  file_name TEXT,
  week_date DATE,
  records_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  imported_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- דוחות שנוצרו
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_date DATE NOT NULL,
  title TEXT NOT NULL,
  content_hebrew TEXT,
  rup_data TEXT,     -- JSON
  nps_data TEXT,     -- JSON
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
