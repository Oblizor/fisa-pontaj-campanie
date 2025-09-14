const fs = require('fs');
const path = require('path');
const { program } = require('commander');

function parseTime(str) {
  const [h, m] = (str || '0:0').split(':').map(Number);
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

function parseDateInput(str) {
  if (typeof str !== 'string') return new Date(NaN);
  const ro = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ro) {
    const [, day, month, year] = ro;
    return new Date(`${year}-${month}-${day}`);
  }
  return new Date(str);
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
      if ((from && dateObj < from) || (to && dateObj > to)) {
        continue;
      }
      const dateStr = row.date;
      const hours = computeHours(row);
      if (!report[worker]) report[worker] = {};
      report[worker][dateStr] = (report[worker][dateStr] || 0) + hours;
    }
  }
  return report;
}

function formatReport(rep, format = 'decimal') {
  let out = '';
  const workers = Object.keys(rep).sort();

  for (const worker of workers) {
    out += `\n${worker}\n`;
    const dates = Object.keys(rep[worker]).sort();
    for (const d of dates) {
      const dateFmt = new Date(d).toLocaleDateString('ro-RO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\./g, '/');
    }
  }
  return out.trim();
}

if (require.main === module) {
  program
    .requiredOption('--from <date>', 'start date (DD/MM/YYYY or YYYY-MM-DD)')
    .requiredOption('--to <date>', 'end date (DD/MM/YYYY or YYYY-MM-DD)')
    .option('--dir <path>', 'directory with timesheets', path.join(__dirname, 'data'))
    .option('--format <type>', 'output format (decimal or hours-minutes)', 'decimal');

  program.parse(process.argv);

  const { dir, from, to, format } = program.opts();

  if (format !== 'decimal' && format !== 'hours-minutes') {
    console.error(`Invalid --format value: ${format}. Choose 'decimal' or 'hours-minutes'.`);
    process.exit(1);
  }

  const fromDate = parseDateInput(from);
  if (isNaN(fromDate)) {
    console.error(`Invalid --from date: ${from}`);
    process.exit(1);
  }

  const toDate = parseDateInput(to);
  if (isNaN(toDate)) {
    console.error(`Invalid --to date: ${to}`);
    process.exit(1);
  }

  if (fromDate > toDate) {
    console.error('--from date must be less than or equal to --to date');
    process.exit(1);
  }

  try {
    const rep = generateReport(dir, fromDate, toDate);
    const formatted = formatReport(rep, format);
    if (formatted) {
      console.log(formatted);
    } else {
      console.log('No activity found for selected period.');
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { generateReport, formatReport, computeHours, parseTime };
