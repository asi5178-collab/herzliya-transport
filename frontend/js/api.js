// API client - כל הפנייות לשרת

const API = (() => {
  const BASE = '/api';

  function getHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }

  async function request(method, endpoint, body = null) {
    const opts = { method, headers: getHeaders() };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const res = await fetch(BASE + endpoint, opts);
    const data = await res.json().catch(() => ({ error: 'שגיאת תקשורת' }));

    if (res.status === 401) {
      Auth.logout();
      return null;
    }
    if (!res.ok) throw new Error(data.error || `שגיאה ${res.status}`);
    return data;
  }

  return {
    get: (ep) => request('GET', ep),
    post: (ep, body) => request('POST', ep, body),
    put: (ep, body) => request('PUT', ep, body),
    patch: (ep, body) => request('PATCH', ep, body),
    del: (ep) => request('DELETE', ep),
    // Tasks extra
    rupTotal: () => request('GET', '/dashboard/rup-total'),

    // Auth
    login: (u, p) => request('POST', '/auth/login', { username: u, password: p }),
    me: () => request('GET', '/auth/me'),

    // Dashboard
    summary: () => request('GET', '/dashboard/summary'),
    rupTrend: () => request('GET', '/dashboard/rup-trend'),
    npsTrend: () => request('GET', '/dashboard/nps-trend'),
    correlation: () => request('GET', '/dashboard/correlation'),
    weeklySummary: () => request('GET', '/dashboard/weekly-summary'),
    openTasks: () => request('GET', '/dashboard/open-tasks'),

    // Zones
    zones: () => request('GET', '/zones'),
    createZone: (d) => request('POST', '/zones', d),
    updateZone: (id, d) => request('PUT', `/zones/${id}`, d),
    zoneStudents: (id) => request('GET', `/zones/${id}/students`),

    // Students
    students: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request('GET', `/students${qs ? '?' + qs : ''}`);
    },
    studentStats: () => request('GET', '/students/stats'),
    createStudent: (d) => request('POST', '/students', d),
    updateStudent: (id, d) => request('PUT', `/students/${id}`, d),
    deleteStudent: (id) => request('DELETE', `/students/${id}`),

    // Lines
    lines: () => request('GET', '/lines'),
    line: (id) => request('GET', `/lines/${id}`),
    updateLine: (id, d) => request('PUT', `/lines/${id}`, d),
    createLine: (d) => request('POST', '/lines', d),

    // Weekly
    ridership: (params = {}) => { const qs = new URLSearchParams(params).toString(); return request('GET', `/weekly/ridership${qs ? '?' + qs : ''}`); },
    addRidership: (d) => request('POST', '/weekly/ridership', d),
    weeks: () => request('GET', '/weekly/weeks'),

    // Analysis
    analyzeText: (d) => request('POST', '/analysis/whatsapp-text', d),
    getAnalysis: (date) => request('GET', `/analysis/week/${date}`),
    analysisHistory: () => request('GET', '/analysis/history'),
    analysisWeeks: () => request('GET', '/analysis/weeks'),
    generateReport: (week_date) => request('POST', '/analysis/generate-report', { week_date }),
    optimizeRoute: (line_id) => request('POST', '/analysis/optimize-route', { line_id }),

    // Import
    importLog: () => request('GET', '/import/log'),
    importWhatsapp: (d) => request('POST', '/import/whatsapp', d),
    importRidership: (d) => request('POST', '/weekly/ridership', d),

    // Tasks
    tasks: (status) => request('GET', `/tasks${status ? '?status=' + status : ''}`),
    createTask: (d) => request('POST', '/tasks', d),
    updateTask: (id, d) => request('PUT', `/tasks/${id}`, d),
    taskStatus: (id, s) => request('PATCH', `/tasks/${id}/status`, { status: s }),

    // Reports
    reports: () => request('GET', '/reports'),
    report: (id) => request('GET', `/reports/${id}`),

    // Users (admin)
    users: () => request('GET', '/users'),
    createUser: (d) => request('POST', '/users', d),
    updateUser: (id, d) => request('PUT', `/users/${id}`, d),
  };
})();

// Auth helper
const Auth = {
  save(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  },
  getUser() {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  },
  isLoggedIn() { return !!localStorage.getItem('token'); },
  hasRole(...roles) {
    const u = this.getUser();
    return u && roles.includes(u.role);
  },
  requireAuth() {
    if (!this.isLoggedIn()) { window.location.href = '/login.html'; return false; }
    return true;
  },
  getToken() { return localStorage.getItem('token'); }
};

// Toast notifications
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.style.cssText = `position:fixed;top:20px;left:20px;z-index:9999;min-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn .3s ease`;
  el.innerHTML = `<i class="bi bi-${type === 'success' ? 'check-circle' : type === 'danger' ? 'x-circle' : 'info-circle'}"></i> ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// פורמט תאריך עברי
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('he-IL');
}

// רמת שביעות לעברית
function satisfactionLabel(level) {
  return { critical: 'קריטי', developing: 'מתפתח', good: 'טוב', excellent: 'מצוין' }[level] || level;
}

// סטייל ל-NPS
function npsStyle(score) {
  if (score >= 4) return 'excellent';
  if (score >= 3.5) return 'good';
  if (score >= 2.5) return 'developing';
  return 'critical';
}

// צבע RUP
function rupColor(rup) {
  if (rup >= 40) return '#16a34a';
  if (rup >= 25) return '#2563eb';
  if (rup >= 10) return '#d97706';
  return '#dc2626';
}
