const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../../database/db');
const { auth, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(auth, requireRole('admin'));

router.get('/', (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, username, full_name, role, email, is_active, last_login, created_at FROM users ORDER BY full_name'
  ).all();
  res.json(users);
});

router.post('/', (req, res) => {
  const { username, password, full_name, role, email } = req.body;
  if (!username || !password || !full_name || !role) return res.status(400).json({ error: 'חסרים פרטים' });

  const db = getDb();
  try {
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role, email) VALUES (?,?,?,?,?)'
    ).run(username, bcrypt.hashSync(password, 10), full_name, role, email);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'שם משתמש כבר קיים' });
    res.status(500).json({ error: 'שגיאה ביצירת משתמש' });
  }
});

router.put('/:id', (req, res) => {
  const { full_name, role, email, is_active, password } = req.body;
  const db = getDb();
  db.prepare('UPDATE users SET full_name=?, role=?, email=?, is_active=? WHERE id=?'
  ).run(full_name, role, email, is_active, req.params.id);

  if (password && password.length >= 6) {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.params.id);
  }
  res.json({ success: true });
});

module.exports = router;
