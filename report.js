const fs = require('fs');
const path = require('path');
const { program } = require('commander');

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
    const worker = json.meta?.worker || path.basename(file, '.json').replace(/^pontaj_/, '');
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
  let out = '';
  for (const worker of Object.keys(rep).sort()) {
    out += `\n${worker}\n`;
    const dates = Object.keys(rep[worker]).sort();
    for (const d of dates) {
      out += `  ${d}: ${rep[worker][d].toFixed(2)}h\n`;
    }
  }
  return out.trim();
}

if (require.main === module) {
  program
    .requiredOption('--from <date>', 'start date (YYYY-MM-DD)')
    .requiredOption('--to <date>', 'end date (YYYY-MM-DD)')
    .option('--dir <path>', 'directory with timesheets', path.join(__dirname, 'data'));

  program.parse(process.argv);

  const { dir, from, to } = program.opts();
  const rep = generateReport(dir, from, to);
  const formatted = formatReport(rep);
  if (formatted) {
    console.log(formatted);
  } else {
    console.log('No activity.');
  }
}

module.exports = { generateReport, formatReport };
