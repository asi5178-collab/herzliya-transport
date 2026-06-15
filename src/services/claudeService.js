const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY לא מוגדר ב-.env');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const STAKEHOLDERS = ['ערן ראובני', 'חברת דברת', 'מועצת תלמידים', 'מנהל החינוך', 'הורים', 'נהג'];

function safeParseClaudeJSON(rawText, messageCount) {
  // הסר גדרות קוד אם יש
  let cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  // חלץ את ה-JSON הראשון (גרסה מלאה)
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) cleaned = match[0];

  // נסה לפרסר ישירות
  try { return JSON.parse(cleaned); } catch (_) {}

  // תיקון: גרשיים כפולים לא מוסקייפים בתוך מחרוזות
  try {
    const fixed = cleaned
      .replace(/:\s*"((?:[^"\\]|\\.)*)"/g, (m, inner) => {
        const escaped = inner.replace(/(?<!\\)"/g, '\\"');
        return `: "${escaped}"`;
      });
    return JSON.parse(fixed);
  } catch (_) {}

  // תיקון: JSON שנחתך — נסה לסגור סוגריים פתוחים
  try {
    let truncFix = cleaned.trimEnd();
    // הסר פסיק אחרון לפני סגירה
    truncFix = truncFix.replace(/,\s*$/, '');
    // ספור סוגריים פתוחים וסגור אותם
    const opens = (truncFix.match(/\[/g) || []).length - (truncFix.match(/\]/g) || []).length;
    const braces = (truncFix.match(/\{/g) || []).length - (truncFix.match(/\}/g) || []).length;
    // סגור מחרוזת פתוחה אם יש
    if ((truncFix.match(/"/g) || []).length % 2 !== 0) truncFix += '"';
    for (let i = 0; i < opens; i++) truncFix += ']';
    for (let i = 0; i < braces; i++) truncFix += '}';
    return JSON.parse(truncFix);
  } catch (_) {}

  // פולבק: חלץ שדות בודדים מהטקסט הגולמי
  const npsMatch    = rawText.match(/"nps_score"\s*:\s*([\d.]+)/);
  const satMatch    = rawText.match(/"satisfaction_score"\s*:\s*([\d.]+)/);
  const levelMatch  = rawText.match(/"satisfaction_level"\s*:\s*"(\w+)"/);
  const summaryMatch= rawText.match(/"summary"\s*:\s*"([^"]{10,})"/);

  const extractArray = (key) => {
    const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*?)\\]`));
    if (!m) return [];
    return m[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g,'')) || [];
  };

  return {
    nps_score: npsMatch ? parseFloat(npsMatch[1]) : (satMatch ? parseFloat(satMatch[1]) : 3.0),
    satisfaction_score: satMatch ? parseFloat(satMatch[1]) : (npsMatch ? parseFloat(npsMatch[1]) : 3.0),
    satisfaction_level: levelMatch ? levelMatch[1] : 'developing',
    message_count: messageCount,
    summary: summaryMatch ? summaryMatch[1] : 'ניתוח הושלם (עיבוד JSON חלקי — הטקסט ארוך מדי)',
    positive_themes: extractArray('positive_themes'),
    negative_themes: extractArray('negative_themes'),
    recommendations: extractArray('recommendations'),
    tasks: []
  };
}

// =====================================================================
// ניתוח טקסט חופשי — ללא דרישות פורמט
// =====================================================================
async function analyzeRawText(text, weekDate, weekNumber, contextData = {}) {
  const anthropic = getClient();

  const lines = text.split('\n').filter(l => l.trim().length > 2).length;

  const systemPrompt = `אתה מנתח מומחה לשביעות רצון לקוחות בתחבורה עירונית - עיריית הרצליה.
אתה מקבל טקסט גולמי (ייתכן שהוא שיחת WhatsApp, ייתכן שהוא פשוט טקסט - לא משנה הפורמט).
תפקידך: לנתח את תוכן ההודעות ולתת:
1. ציון שביעות רצון NPS (1-5)
2. נושאים לשימור (מה עובד טוב)
3. נושאים לשיפור (מה צריך לשפר)
4. המלצות מעשיות
5. משימות לפי בעלי עניין

בעלי עניין: ${STAKEHOLDERS.join(' | ')}
קטגוריות: שימור (שמירה על מה שטוב) | שיפור (תיקון בעיות) | ביצוע (בתהליך)

RUP נוכחי: ${contextData.current_rup || '?'}% | שבוע ${weekNumber || '?'} (${weekDate})
החזר JSON בלבד.`;

  const userPrompt = `נתח את הטקסט הבא ותן ציון ומשימות. הטקסט הוא פידבק מהורים על שירות ההסעות לתיכוניסטים:

---
${text}
---

החזר JSON בדיוק בפורמט הזה (כל השדות בעברית):
{
  "nps_score": 3.5,
  "satisfaction_level": "developing",
  "message_count": ${lines},
  "summary": "סיכום 2-3 משפטים על מצב השירות",
  "positive_themes": ["נושא שימור 1", "נושא שימור 2", "נושא שימור 3"],
  "negative_themes": ["נושא שיפור 1", "נושא שיפור 2"],
  "recommendations": ["המלצה מעשית 1", "המלצה 2", "המלצה 3"],
  "tasks": [
    {
      "title": "כותרת משימה קצרה",
      "description": "מה בדיוק לעשות",
      "priority": "high",
      "deadline": "${getDeadline(weekDate, 2)}",
      "stakeholder": "ערן ראובני",
      "category": "שיפור"
    },
    {
      "title": "משימת שימור",
      "description": "מה להמשיך לשמר",
      "priority": "medium",
      "deadline": "${getDeadline(weekDate, 4)}",
      "stakeholder": "מנהל החינוך",
      "category": "שימור"
    }
  ],
  "sentiment_breakdown": {
    "positive_percent": 60,
    "negative_percent": 25,
    "neutral_percent": 15
  },
  "key_quotes": ["ציטוט מייצג 1", "ציטוט מייצג 2"]
}

חוקים חשובים:
- satisfaction_level חייב להיות: critical | developing | good | excellent
- priority: high | medium | low
- category: שיפור | שימור | ביצוע
- stakeholder חייב להיות מ: ${STAKEHOLDERS.join(' | ')}
- צור 3-5 משימות עם בעלי עניין מגוונים
- positive_themes = דברים לשמר | negative_themes = דברים לשפר`;

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  if (response.stop_reason === 'max_tokens') {
    console.warn('analyzeRawText: תגובת Claude נחתכה — שקול לקצר את הטקסט');
  }

  const rawText = response.content[0].text.trim();
  const result = safeParseClaudeJSON(rawText, lines);
  result.raw_analysis = rawText;
  result.model_used = response.model;
  return result;
}

// helper לחישוב תאריך יעד
function getDeadline(weekDate, weeksAhead) {
  try {
    const d = new Date(weekDate);
    d.setDate(d.getDate() + weeksAhead * 7);
    return d.toISOString().split('T')[0];
  } catch { return ''; }
}

async function generateWeeklyReport(weekData) {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `כתוב דוח שבועי מקצועי בעברית למנהל הסעות עיריית הרצליה.

שבוע ${weekData.week_number} (${weekData.week_date}):
- RUP: ${weekData.avg_rup}% | נוסעים: ${weekData.total_riders}
- NPS הורים: ${weekData.nps_score}/5 (${weekData.satisfaction_level})
- לשימור: ${weekData.positive_themes?.join(', ')}
- לשיפור: ${weekData.negative_themes?.join(', ')}
- המלצות: ${weekData.recommendations?.join('; ')}

כלול: כותרת, סיכום מנהלים, נתוני RUP, ניתוח NPS, נושאי שימור ושיפור, המלצות לפעולה, משימות, מגמה.`
    }]
  });
  return response.content[0].text;
}

async function optimizeRoute(lineData, studentLocations) {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `מומחה אופטימיזציה מסלולים, עיריית הרצליה.
קו: ${lineData.name} (קיבולת: ${lineData.capacity}). תחנות: ${JSON.stringify(lineData.waypoints)}
תלמידים (${studentLocations.length}): ${studentLocations.slice(0,10).map(s=>`${s.name}: ${s.address}`).join(', ')}
המלץ בעברית: תחנות חדשות? סדר אופטימלי? זמן נסיעה?`
    }]
  });
  return response.content[0].text;
}

// =====================================================================
// ניתוח טקסט WhatsApp קבוצות תלמידים
// =====================================================================
async function analyzeStudentText(text, weekDate, weekNumber, contextData = {}) {
  const anthropic = getClient();
  const lines = text.split('\n').filter(l => l.trim().length > 2).length;

  const systemPrompt = `אתה מנתח מומחה לחווית תלמידים בתחבורה עירונית - עיריית הרצליה.
אתה מקבל טקסט מקבוצת WhatsApp של תלמידים (תיכוניסטים) שמשתמשים בשירות ההסעות.
שים לב: זו פרספקטיבת התלמידים — שונה מפרספקטיבת ההורים.
תפקידך: לנתח את חווית התלמידים ולהפיק תובנות ומשימות לשיפור שירות ההסעות.

בעלי עניין: ${STAKEHOLDERS.join(' | ')}
שבוע ${weekNumber || '?'} (${weekDate})
החזר JSON בלבד.`;

  const userPrompt = `נתח את הטקסט הבא מקבוצת WhatsApp של תלמידים שמשתמשים בהסעות:

---
${text}
---

החזר JSON בדיוק בפורמט הזה (כל השדות בעברית):
{
  "satisfaction_score": 3.5,
  "satisfaction_level": "developing",
  "message_count": ${lines},
  "summary": "סיכום 2-3 משפטים על חווית התלמידים",
  "positive_themes": ["דבר שהתלמידים אוהבים 1", "דבר שהתלמידים אוהבים 2"],
  "negative_themes": ["בעיה שהתלמידים מעלים 1", "בעיה שהתלמידים מעלים 2"],
  "student_insights": ["תובנה ייחודית לתלמידים 1", "תובנה ייחודית 2"],
  "recommendations": ["המלצה מעשית 1", "המלצה 2", "המלצה 3"],
  "tasks": [
    {
      "title": "כותרת משימה קצרה",
      "description": "מה בדיוק לעשות",
      "priority": "high",
      "deadline": "${getDeadline(weekDate, 2)}",
      "stakeholder": "ערן ראובני",
      "category": "שיפור"
    }
  ],
  "key_quotes": ["ציטוט מייצג של תלמיד 1", "ציטוט מייצג 2"],
  "main_topics": ["נושא עיקרי 1", "נושא עיקרי 2", "נושא עיקרי 3"]
}

חוקים חשובים:
- satisfaction_level חייב להיות: critical | developing | good | excellent
- priority: high | medium | low
- category: שיפור | שימור | ביצוע
- stakeholder חייב להיות מ: ${STAKEHOLDERS.join(' | ')}
- צור 2-4 משימות ממוקדות בחווית התלמידים
- הפרד בין מה שהורים אומרים לבין מה שתלמידים חווים בפועל`;

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  if (response.stop_reason === 'max_tokens') {
    console.warn('analyzeStudentText: תגובת Claude נחתכה — שקול לקצר את הטקסט');
  }

  const rawText = response.content[0].text.trim();
  const result = safeParseClaudeJSON(rawText, lines);
  result.raw_analysis = rawText;
  result.model_used = response.model;
  return result;
}

module.exports = { analyzeRawText, analyzeStudentText, generateWeeklyReport, optimizeRoute };
