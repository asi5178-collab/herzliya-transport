# מערכת הסעות תיכונים - הרצליה | מדריך התקנה מלא

## דרישות מקדימות

### 1. התקנת Node.js
הורד מ: https://nodejs.org (גרסה 18 ומעלה)
- בחר "Windows Installer (.msi)"
- התקן עם הגדרות ברירת מחדל
- לאחר התקנה, פתח Terminal חדש ובדוק: `node --version`

### 2. מפתח API של Anthropic (לניתוח WhatsApp)
- כנס ל: https://console.anthropic.com
- צור מפתח API חדש
- שמור אותו - תזדקק לו בהמשך

---

## התקנה

### שלב 1 - פתח Terminal בתיקיית הפרויקט
```
לחץ ימני על תיקיית herzliya-transport → "Open in Terminal"
```

### שלב 2 - הרץ סקריפט ההתקנה
```cmd
install.bat
```
**או ידנית:**
```cmd
npm install
copy .env.example .env
node database/init.js
node database/seed.js
```

### שלב 3 - הגדר מפתח API
פתח `.env` ב-Notepad ועדכן:
```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx...
```

### שלב 4 - הפעל את המערכת
```cmd
start.bat
```
**או:**
```cmd
node server.js
```

---

## גישה למערכת

| דרך גישה | כתובת |
|----------|--------|
| מחשב מקומי | http://localhost:3000 |
| ברשת פנים ארגונית | http://[IP-של-השרת]:3000 |

### משתמשי ברירת מחדל
| שם משתמש | סיסמה | הרשאה |
|----------|--------|--------|
| admin | admin123 | ניהול מלא |
| manager | manager123 | מנהל הסעות |
| viewer | viewer123 | צפייה בלבד |

**⚠️ שנה סיסמאות לאחר כניסה ראשונה!** (ניהול משתמשים)

---

## פעולות שבועיות

### עדכון שבועי (כל שני בבוקר)
```
1. כנס ל: http://localhost:3000
2. ניתוח WhatsApp → הדבק הודעות מהקבוצה → "הפעל ניתוח Claude"
3. נסיעות שבועיות → הוסף מספר נוסעים בפועל לכל קו
4. ניתוח WhatsApp → "צור דוח שבועי"
5. ייצא ל-PDF (הדפסה)
6. גיבוי: הרץ backup.bat
```

### פקודות שימושיות
```cmd
node server.js          # הפעל שרת
start.bat               # הפעלה מהירה
backup.bat              # גיבוי DB
node database/seed.js   # איפוס נתוני דוגמה
```

---

## ארכיטקטורת המערכת

```
מדד RUP ─────────────────────────────
  ↓ נסיעות שבועיות (ידני/CSV)        │
  ↓ חישוב אוטומטי: נוסעים/רשומים    │
  ↓ גרף מגמה + יעדים (Q2/Q4/שנה 2)  │
                                       │ קורלציה
מדד NPS ─────────────────────────────┘
  ↓ הדבקת הודעות WhatsApp             │
  ↓ Claude מנתח: ציון 1-5             │
  ↓ נושאים חיוביים/שליליים           │
  ↓ המלצות + משימות אוטומטיות        │
                                        │
דוח שבועי ← Claude מסכם הכל           │
  ↓ PDF למנהלים                        │
```

---

## הרחבת המערכת

### הוספת אזור חדש
דפדפן → אזורים → "אזור חדש" → מלא שם, קוד, קואורדינטות

### הוספת קו חדש
API:
```bash
POST /api/lines
{
  "name": "קו 1ג",
  "code": "1C",
  "capacity": 50,
  "vehicle_type": "bus"
}
```

### ייבוא נתונים מ-Excel
קובץ CSV בפורמט:
```csv
קו,נוסעים,רשומים,קיבולת
1A,27,478,50
1B,13,203,50
```
העלה ב: נסיעות שבועיות → ייבוא קובץ

---

## אבטחה בסביבת רשת

### הגבלת גישה ל-IP ספציפי
ב-.env הוסף:
```
ALLOWED_IPS=192.168.1.0/24
```

### HTTPS (מומלץ)
```cmd
npm install -g local-ssl-proxy
local-ssl-proxy --source 443 --target 3000
```

### שינוי פורט
```
PORT=8080
```

---

## פתרון בעיות

**"אין חיבור לשרת"**
→ בדוק שהשרת רץ (node server.js / start.bat)
→ בדוק firewall: פורט 3000 פתוח

**"ניתוח Claude נכשל"**
→ בדוק ANTHROPIC_API_KEY ב-.env
→ בדוק חיבור לאינטרנט

**"DB לא נמצא"**
→ הרץ: node database/init.js

**נשכחה סיסמת admin**
```cmd
node -e "const db=require('better-sqlite3')('./database/herzliya.db');const bc=require('bcryptjs');db.prepare('UPDATE users SET password_hash=? WHERE username=?').run(bc.hashSync('newpass123',10),'admin');console.log('done');"
```

---

## תמיכה
- Claude Code: כתוב בטרמינל `claude` בתיקיית הפרויקט
- CLAUDE.md מכיל הוראות מלאות לסייען AI
