# CLAUDE.md - מערכת הסעות תיכונים - עיריית הרצליה

## תיאור המערכת
מערכת ניהול הסעות לתלמידי תיכון במערב הרצליה. המערכת עוקבת אחר נסיעות שבועיות,
מנתחת משוב הורים מ-WhatsApp, מחשבת מדד RUP ו-NPS, ומייצרת המלצות לשיפור.

## הקשר עסקי
- **רשות:** עיריית הרצליה
- **אוכלוסייה:** 707 תלמידי תיכון, 684 זקוקים להסעה
- **קווים:** קו 1א (478 תלמידים), קו 1ב (203 תלמידים)
- **בתי ספר:** תיכון עירוני חדש (337), יובל (82), ראשון (77), הנדסאים (73)

## מדדי מפתח (KPIs)
- **RUP** (Ridership Utilization Percentage) - יעד: Q2=10%, Q4=30%, שנה 2=40%
  - קריטי: <10% | מתפתח: 10-24% | טוב: 25-39% | מצוין: ≥40%
- **NPS הורים** (1-5): מבוסס ניתוח הודעות WhatsApp שבועיות
- **NPS תלמידים**: מאפליקציית SchoolRide (6 שאלות יומיות)

## ארכיטקטורה טכנית
- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3)
- **Frontend:** HTML + Bootstrap 5 RTL + Chart.js + Leaflet.js
- **Auth:** JWT tokens + bcrypt
- **AI:** Claude API (Anthropic) לניתוח הודעות WhatsApp

## מבנה קבצים
```
server.js              - שרת Express ראשי
database/
  schema.sql           - סכמת DB
  init.js              - אתחול DB
  seed.js              - נתוני דוגמה
src/
  auth/
    middleware.js      - JWT middleware
    routes.js          - login/logout
  routes/              - API routes
  services/
    claudeService.js   - ניתוח Claude API
    importService.js   - ייבוא Excel/CSV
    reportService.js   - יצירת דוחות
frontend/              - HTML/CSS/JS
```

## כללי תכנות
- כל הודעות שגיאה בעברית
- משתנים באנגלית, הערות בעברית
- כל query ל-DB עם error handling
- לוג של כל ייבוא ל-import_log
- NEVER DELETE - השתמש ב-is_active=0
- גיבוי לפני כל שינוי גדול

## תהליך עדכון שבועי
1. קבל קובץ נסיעות (Excel/CSV) → POST /api/import/ridership
2. הדבק הודעות WhatsApp → POST /api/analysis/whatsapp
3. Claude מנתח ומחזיר NPS + המלצות
4. מערכת מייצרת דוח + משימות
5. גיבוי: backups/herzliya_YYYYMMDD.db

## הרשאות
- admin: ניהול מלא + ניהול משתמשים
- manager: עדכון נתונים + ניתוח + דוחות
- viewer: צפייה בלבד
