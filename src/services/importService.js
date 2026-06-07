const XLSX = require('xlsx');
const fs = require('fs');

async function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return data.map(row => ({
    line_code: row['קו'] || row['line_code'] || row['code'] || '',
    actual_riders: parseInt(row['נוסעים'] || row['actual'] || row['actual_riders'] || 0),
    registered_students: parseInt(row['רשומים'] || row['registered'] || row['registered_students'] || 0),
    capacity: parseInt(row['קיבולת'] || row['capacity'] || 0) || null,
    notes: row['הערות'] || row['notes'] || ''
  })).filter(r => r.line_code && r.actual_riders > 0);
}

async function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  if (!lines.length) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push({
      line_code: row['קו'] || row['line_code'] || row['code'] || '',
      actual_riders: parseInt(row['נוסעים'] || row['actual_riders'] || 0),
      registered_students: parseInt(row['רשומים'] || row['registered_students'] || 0),
      capacity: parseInt(row['קיבולת'] || row['capacity'] || 0) || null,
      notes: row['הערות'] || row['notes'] || ''
    });
  }

  return rows.filter(r => r.line_code && r.actual_riders > 0);
}

module.exports = { parseExcel, parseCSV };
