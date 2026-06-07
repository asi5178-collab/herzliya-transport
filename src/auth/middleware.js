const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'herzliya-transport-secret';

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'נדרשת התחברות' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'טוקן לא תקין' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'אין הרשאה לפעולה זו' });
    }
    next();
  };
}

module.exports = { auth, requireRole };
