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

  // חלץ את ה-JSON הראשון
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

  // פולבק: בנה אובייקט מינימלי מהטקסט הגולמי
  const npsMatch = rawText.match(/"nps_score"\s*:\s*([\d.]+)/);
  const levelMatch = rawText.match(/"satisfaction_level"\s*:\s*"(\w+)"/);
  return {
    nps_score: npsMatch ? parseFloat(npsMatch[1]) : 3.0,
    satisfaction_level: levelMatch ? levelMatch[1] : 'developing',
    message_count: messageCount,
    summary: 'ניתוח הושלם (עיבוד JSON חלקי)',
    positive_themes: [],
    negative_themes: [],
    recommendations: [],
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
    max_tokens: 2500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

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

module.exports = { analyzeRawText, generateWeeklyReport, optimizeRoute };
