// ===== מערכת תרגום עברית ↔ אנגלית =====
const I18N = (() => {
  const KEY = 'hz_lang';

  // מילון תרגום מלא
  const EN = {
    // ניווט
    'דשבורד': 'Dashboard',
    'ניתוח WhatsApp': 'WhatsApp Analysis',
    'נסיעות שבועיות': 'Weekly Ridership',
    'משימות': 'Tasks',
    'תלמידים': 'Students',
    'אזורים': 'Zones',
    'קווים': 'Lines',
    'מפה ואופטימיזציה': 'Map & Optimization',
    'מפה': 'Map',
    'דוחות': 'Reports',
    'ניהול משתמשים': 'User Management',
    'יציאה': 'Logout',
    'מערכת ניהול תחבורה': 'Transport Management',
    // דשבורד
    'לוח בקרה - מערכת הסעות הרצליה': 'Dashboard - Herzliya Transport',
    'RUP שבוע אחרון': 'Last Week RUP',
    'NPS הורים (1-5)': 'Parent NPS (1-5)',
    'תלמידים פעילים': 'Active Students',
    'משימות פתוחות': 'Open Tasks',
    'מגמת RUP שבועית (%)': 'Weekly RUP Trend (%)',
    'מגמת NPS הורים (1-5)': 'Parent NPS Trend (1-5)',
    'קורלציה: RUP ↔ NPS': 'Correlation: RUP ↔ NPS',
    'משימות דחופות': 'Urgent Tasks',
    'סיכום שבועי': 'Weekly Summary',
    'כל הדוחות': 'All Reports',
    'כל הנתונים': 'All Data',
    // טבלה
    'שבוע': 'Week',
    'תאריך': 'Date',
    'קו': 'Line',
    'נוסעים': 'Riders',
    'נוסעים בפועל': 'Actual Riders',
    "סה\"כ רשומים": 'Total Registered',
    'קיבולת': 'Capacity',
    'סטטוס': 'Status',
    'פעולות': 'Actions',
    'הורה': 'Parent',
    'כתובת': 'Address',
    'בית ספר': 'School',
    'אזור': 'Zone',
    'שם תלמיד': 'Student Name',
    // סטטוס RUP
    'קריטי': 'Critical',
    'מתפתח': 'Developing',
    'טוב': 'Good',
    'מצוין': 'Excellent',
    // קטגוריות משימות
    'שיפור': 'Improvement',
    'שימור': 'Retention',
    'ביצוע': 'In Progress',
    // עדיפות
    'דחוף': 'Urgent',
    'בינוני': 'Medium',
    'נמוך': 'Low',
    // סטטוס משימות
    'פתוחות': 'Open',
    'הושלמו': 'Done',
    'באיחור': 'Overdue',
    'בביצוע': 'In Progress',
    'פתוח': 'Open',
    'הושלם': 'Done',
    // כפתורים
    'הוסף': 'Add',
    'שמור': 'Save',
    'ביטול': 'Cancel',
    'ערוך': 'Edit',
    'מחק': 'Delete',
    'עדכן': 'Update',
    'הדפס': 'Print',
    'סגור': 'Close',
    'חפש': 'Search',
    'יצוא': 'Export',
    'ייבא': 'Import',
    // ניתוח
    'הפעל ניתוח Claude AI': 'Run Claude AI Analysis',
    'צור דוח שבועי': 'Generate Weekly Report',
    'ניתוחים קודמים': 'Previous Analyses',
    'תוצאות ניתוח': 'Analysis Results',
    'לשימור': 'Retain',
    'לשיפור': 'Improve',
    'המלצות': 'Recommendations',
    'משימות שנוצרו': 'Generated Tasks',
    // שדות טפסים
    'תאריך שבוע': 'Week Date',
    'מספר שבוע (W-)': 'Week Number (W-)',
    'מספר שבוע': 'Week Number',
    "קו (אופציונלי)": 'Line (optional)',
    "כל הקווים": 'All Lines',
    "כל האזורים": 'All Zones',
    // יעדים
    'יעד Q2': 'Q2 Target',
    'יעד Q4': 'Q4 Target',
    'יעד שנה 2': 'Year 2 Target',
    'מהיעד': 'of target',
    'ממתין לניתוח': 'Pending analysis',
    // כללי
    'מקרא': 'Legend',
    'סטטיסטיקות מוצגות': 'Display Stats',
    'פילטרים': 'Filters',
    'הצג:': 'Show:',
    'תלמידים רשומים': 'Registered students',
    "עדכון שבועי": 'Weekly Update',
    'שמור שינויים': 'Save Changes',
    'צפה בדוחות': 'View Reports',
    'צפה במשימות': 'View Tasks',
    'כל המשימות': 'All Tasks',
    'משימה חדשה': 'New Task',
    'בעל עניין': 'Stakeholder',
    'קטגוריה': 'Category',
    'עדיפות': 'Priority',
    'אחראי': 'Assignee',
    'מקור': 'Source',
    'ידני': 'Manual',
    'תיאור': 'Description',
    'כותרת': 'Title',
    'יעד': 'Target',
    // נסיעות
    'הוספת / עדכון נתוני נסיעה': 'Add / Update Ridership Data',
    'גרף RUP לפי שבוע': 'RUP Chart by Week',
    'פירוט לפי שבוע וקו': 'Details by Week & Line',
    'מחיקת שבוע שלם:': 'Delete Entire Week:',
    'מחק שבוע': 'Delete Week',
    'מוחק את כל הנתונים של השבוע לכל הקווים': 'Deletes all week data across all lines',
    'התקדמות ליעדי RUP': 'RUP Target Progress',
    'נוסעים:': 'Riders:',
    'רשומים:': 'Registered:',
    // NPS
    'NPS הורים': 'Parent NPS',
    'סף טוב (3.5)': 'Good threshold (3.5)',
    'מקדם קורלציה פירסון': 'Pearson Correlation Coefficient',
    'קורלציה חזקה': 'Strong correlation',
    'קורלציה חלשה': 'Weak correlation',
    // אזורים
    'ניהול אזורים גיאוגרפיים': 'Geographic Zone Management',
    'אזור חדש': 'New Zone',
    'שם אזור': 'Zone Name',
    'קוד': 'Code',
    'קואורדינטות': 'Coordinates',
    'צבע': 'Color',
    // ניהול
    'ניהול משתמשים ורשאיות': 'User Management & Permissions',
    'משתמש חדש': 'New User',
    'שם מלא': 'Full Name',
    'שם משתמש': 'Username',
    'סיסמה': 'Password',
    'תפקיד': 'Role',
    'אימייל': 'Email',
    'סטטוס': 'Status',
    'פעיל': 'Active',
    'לא פעיל': 'Inactive',
    'שינוי סיסמה אישית': 'Change My Password',
    'סיסמה נוכחית': 'Current Password',
    'סיסמה חדשה': 'New Password',
    'שנה סיסמה': 'Change Password',
  };

  // מילון הפוך (אנגלית → עברית)
  const HE = Object.fromEntries(Object.entries(EN).map(([k, v]) => [v, k]));

  let lang = localStorage.getItem(KEY) || 'he';
  let textNodeCache = []; // cache of {node, he, en}

  function getLang() { return lang; }

  function t(heText) {
    return lang === 'en' ? (EN[heText] || heText) : heText;
  }

  // ============================================
  // מנוע תרגום DOM — מחפש כל text nodes ומתרגם
  // ============================================
  function translateDOM(toLang) {
    const isEn = toLang === 'en';

    // 1. apply body attribute for CSS
    document.body.setAttribute('data-lang', toLang);
    document.documentElement.lang = toLang;
    document.documentElement.dir = isEn ? 'ltr' : 'rtl';

    // 2. Walk all visible text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
          if (p.closest('script,style')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    for (const node of nodes) {
      const raw = node.textContent;
      const trimmed = raw.trim();
      if (!trimmed || trimmed.length < 2) continue;

      // Store original Hebrew if first time
      if (!node._he) {
        node._he = raw;
        node._en = raw.replace(trimmed, EN[trimmed] || trimmed);
      }

      node.textContent = isEn ? node._en : node._he;
    }

    // 3. Translate placeholders
    document.querySelectorAll('[placeholder]').forEach(el => {
      if (!el._ph_he) el._ph_he = el.placeholder;
      el.placeholder = isEn ? (EN[el._ph_he] || el._ph_he) : el._ph_he;
    });

    // 4. Update toggle button
    updateToggle();
  }

  function setLang(l) {
    lang = l;
    localStorage.setItem(KEY, l);
    translateDOM(l);
  }

  function updateToggle() {
    const btn = document.getElementById('langToggle');
    if (btn) btn.textContent = lang === 'he' ? '🇺🇸 EN' : '🇮🇱 עב';
  }

  function addToggle() {
    if (document.getElementById('langToggle')) return;
    const topbar = document.getElementById('topbar');
    if (!topbar) return;
    const btn = document.createElement('button');
    btn.id = 'langToggle';
    btn.title = 'Toggle language';
    btn.style.cssText = `
      background:#f1f5f9;border:1px solid #e2e8f0;padding:4px 10px;
      border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;
      margin-${lang==='he'?'left':'right'}:8px;flex-shrink:0;
    `;
    btn.onclick = () => setLang(lang === 'he' ? 'en' : 'he');
    topbar.appendChild(btn);
    updateToggle();
  }

  // Auto-init after DOM ready
  function init() {
    addToggle();
    if (lang === 'en') translateDOM('en');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
  } else {
    setTimeout(init, 200);
  }

  return { t, getLang, setLang };
})();
