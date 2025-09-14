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

function formatHM(hours) {
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h} h ${m.toString().padStart(2, '0')} m`;
}

function loadJson(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data;
}

function generateReport(dataDir, fromDate, toDate) {
  const from = fromDate ? new Date(fromDate) : null;
  const to = toDate ? new Date(toDate) : null;
  const report = {};
  let files;
  try {
    files = fs
      .readdirSync(dataDir)
      .filter(f => f.startsWith('pontaj_') && f.endsWith('.json'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Data directory not found: ${dataDir}`);
    }
    throw err;
  }
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
      const dateFmt = new Date(d).toLocaleDateString('ro-RO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\./g, '/');
      out += `  ${dateFmt}: ${formatHM(rep[worker][d])}\n`;
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

  const fromDate = new Date(from);
  if (isNaN(fromDate)) {
    console.error(`Invalid --from date: ${from}`);
    process.exit(1);
  }

  const toDate = new Date(to);
  if (isNaN(toDate)) {
    console.error(`Invalid --to date: ${to}`);
    process.exit(1);
  }

  if (fromDate > toDate) {
    console.error('--from date must be less than or equal to --to date');
    process.exit(1);
  }

  const rep = generateReport(dir, fromDate, toDate);
  const formatted = formatReport(rep);
  if (formatted) {
    console.log(formatted);
  } else {
    console.log('No activity found for selected period.');
  }
}

module.exports = { generateReport, formatReport };
