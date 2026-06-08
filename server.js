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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '1.0.0' });
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
  console.log('  משתמשים ברירת מחדל:');
  console.log('  admin / admin123  (מנהל מלא)');
  console.log('  manager / manager123  (מנהל הסעות)');
  console.log('  viewer / viewer123  (צפייה)');
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
