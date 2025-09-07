const fs = require('fs');
const path = require('path');

function parseTime(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function computeHours(row) {
  if (!row.start || !row.end) return 0;
  let start = parseTime(row.start);
  let end = parseTime(row.end);
  if (row.nextDay || end < start) {
    end += 24 * 60;
  }
  const breakMin = row.breakMin || 0;
  return Math.max(0, (end - start - breakMin) / 60);
}

function loadJson(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data;
}

function generateReport(dataDir, fromDate, toDate) {
  const from = fromDate ? new Date(fromDate) : null;
  const to = toDate ? new Date(toDate) : null;
  const report = {};
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('pontaj_') && f.endsWith('.json'));
  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    const json = loadJson(fullPath);
    const worker = json.meta?.worker || file;
    for (const row of json.rows || []) {
      if (!row.date) continue;
      const dateObj = new Date(row.date);
      if (from && dateObj < from) continue;
      if (to && dateObj > to) continue;
      const dateStr = row.date;
      const hours = computeHours(row);
      if (!report[worker]) report[worker] = {};
      report[worker][dateStr] = (report[worker][dateStr] || 0) + hours;
    }
  }
  return report;
}

function formatReport(rep) {
  const workers = Object.keys(rep);
  if (workers.length === 0) {
    return 'No activity found for selected period.';
  }
  let out = '';
  for (const worker of workers.sort()) {
    out += `\n${worker}\n`;
    const dates = Object.keys(rep[worker]).sort();
    for (const d of dates) {
      out += `  ${d}: ${rep[worker][d].toFixed(2)}h\n`;
    }
  }
  return out.trim();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      options[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  const dataDir = options.dir || path.join(__dirname, 'data');
  const rep = generateReport(dataDir, options.from, options.to);
  console.log(formatReport(rep));
}

module.exports = { generateReport, formatReport };
