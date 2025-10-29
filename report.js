const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { parse: parseCSV } = require('csv-parse/sync');

const DEFAULT_OVERTIME_THRESHOLD = 8;
const DEFAULT_OVERTIME_RATE = 1.5;

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

function computeDailyStats(row, overtimeThreshold = DEFAULT_OVERTIME_THRESHOLD, overtimeRate = DEFAULT_OVERTIME_RATE) {
  const totalHours = computeHours(row);
  const regularHours = Math.min(totalHours, overtimeThreshold);
  const overtimeHours = Math.max(0, totalHours - overtimeThreshold);
  const weightedHours = regularHours + overtimeHours * overtimeRate;
  return { totalHours, regularHours, overtimeHours, weightedHours };
}

function formatHM(hours) {
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h} h ${m.toString().padStart(2, '0')} m`;
}

function parseDateInput(str) {
  if (!str) return new Date(NaN);
  if (str instanceof Date) return new Date(str.getTime());
  const ro = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ro) {
    const [, day, month, year] = ro;
    return new Date(`${year}-${month}-${day}`);
  }
  return new Date(str);
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function slugify(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'pontaj';
}

function getISOWeek(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((target - firstThursday) / 86400000 - 3) / 7);
}

function getISOWeekYear(date) {
  const target = new Date(date.valueOf());
  target.setDate(target.getDate() - ((target.getDay() + 6) % 7) + 3);
  return target.getFullYear();
}

function startOfISOWeek(date) {
  const result = new Date(date.getTime());
  const day = result.getDay() || 7;
  if (day !== 1) {
    result.setDate(result.getDate() - (day - 1));
  }
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfISOWeek(date) {
  const start = startOfISOWeek(date);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getWeekInfo(date) {
  const weekNumber = getISOWeek(date);
  const weekYear = getISOWeekYear(date);
  const start = startOfISOWeek(date);
  const end = endOfISOWeek(date);
  const key = `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
  return { key, weekNumber, year: weekYear, start, end };
}

function ensureWorker(report, worker) {
  if (!report.workers[worker]) {
    report.workers[worker] = {
      name: worker,
      daily: {},
      weekly: {},
      totals: { totalHours: 0, regularHours: 0, overtimeHours: 0, weightedHours: 0 }
    };
  }
  return report.workers[worker];
}

function sumStats(target, stats) {
  target.totalHours += stats.totalHours;
  target.regularHours += stats.regularHours;
  target.overtimeHours += stats.overtimeHours;
  target.weightedHours += stats.weightedHours;
}

function cloneDate(date) {
  return date ? new Date(date.getTime()) : null;
}

function buildReport(timesheets, fromDate, toDate, options = {}) {
  const {
    overtimeThreshold = DEFAULT_OVERTIME_THRESHOLD,
    overtimeRate = DEFAULT_OVERTIME_RATE
  } = options;

  const from = fromDate ? parseDateInput(fromDate) : null;
  const to = toDate ? parseDateInput(toDate) : null;

  if (from && isNaN(from)) {
    throw new Error(`Invalid from date: ${fromDate}`);
  }
  if (to && isNaN(to)) {
    throw new Error(`Invalid to date: ${toDate}`);
  }

  const report = {
    metadata: {
      from: from ? from.toISOString().slice(0, 10) : null,
      to: to ? to.toISOString().slice(0, 10) : null,
      overtimeThreshold,
      overtimeRate,
      generatedAt: new Date().toISOString()
    },
    workers: {},
    comparisons: {
      ranking: [],
      totals: { totalHours: 0, regularHours: 0, overtimeHours: 0, weightedHours: 0 }
    }
  };

  for (const sheet of timesheets) {
    const worker = sheet?.meta?.worker || 'necunoscut';
    let workerEntry = null;

    for (const row of sheet?.rows || []) {
      if (!row || !row.date) continue;
      const dateObj = new Date(row.date);
      if (isNaN(dateObj)) continue;
      if (from && dateObj < from) continue;
      if (to && dateObj > to) continue;

      if (!workerEntry) {
        workerEntry = ensureWorker(report, worker);
      }

      const stats = computeDailyStats(row, overtimeThreshold, overtimeRate);
      const dateKey = row.date;

      if (!workerEntry.daily[dateKey]) {
        workerEntry.daily[dateKey] = {
          date: dateKey,
          totalHours: 0,
          regularHours: 0,
          overtimeHours: 0,
          weightedHours: 0,
          entries: 0
        };
      }

      sumStats(workerEntry.daily[dateKey], stats);
      workerEntry.daily[dateKey].entries += 1;

      const weekInfo = getWeekInfo(dateObj);
      if (!workerEntry.weekly[weekInfo.key]) {
        workerEntry.weekly[weekInfo.key] = {
          key: weekInfo.key,
          weekNumber: weekInfo.weekNumber,
          year: weekInfo.year,
          start: weekInfo.start.toISOString().slice(0, 10),
          end: weekInfo.end.toISOString().slice(0, 10),
          totalHours: 0,
          regularHours: 0,
          overtimeHours: 0,
          weightedHours: 0
        };
      }
      sumStats(workerEntry.weekly[weekInfo.key], stats);

      sumStats(workerEntry.totals, stats);
      sumStats(report.comparisons.totals, stats);
    }
  }

  report.comparisons.ranking = Object.values(report.workers)
    .map(w => ({
      worker: w.name,
      totalHours: w.totals.totalHours,
      regularHours: w.totals.regularHours,
      overtimeHours: w.totals.overtimeHours,
      weightedHours: w.totals.weightedHours
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  return report;
}

function loadTimesheetsFromDir(dataDir) {
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

  const sheets = [];
  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    const json = loadJson(fullPath);
    sheets.push(json);
  }
  return sheets;
}

function generateReport(dataDir, fromDate, toDate, options = {}) {
  const timesheets = loadTimesheetsFromDir(dataDir);
  return buildReport(timesheets, fromDate, toDate, options);
}

function formatHoursValue(hours, mode = 'decimal') {
  if (mode === 'hours-minutes') {
    return formatHM(hours);
  }
  return `${hours.toFixed(2)} h`;
}

function formatDateRO(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  return date
    .toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    .replace(/\./g, '/');
}

function formatReport(report, mode = 'decimal') {
  if (!report || !report.workers || Object.keys(report.workers).length === 0) {
    return '';
  }

  const lines = [];
  const workers = Object.keys(report.workers).sort((a, b) => a.localeCompare(b, 'ro-RO'));

  for (const workerKey of workers) {
    const worker = report.workers[workerKey];
    lines.push(worker.name);
    lines.push(`  Total perioadă: ${formatHoursValue(worker.totals.totalHours, mode)} (Reg: ${formatHoursValue(worker.totals.regularHours, mode)}, Supl: ${formatHoursValue(worker.totals.overtimeHours, mode)}, Ajustat: ${formatHoursValue(worker.totals.weightedHours, mode)})`);

    const weekly = Object.values(worker.weekly).sort((a, b) => new Date(a.start) - new Date(b.start));
    if (weekly.length) {
      lines.push('  Săptămâni:');
      for (const week of weekly) {
        lines.push(
          `    ${week.key} (${formatDateRO(week.start)} - ${formatDateRO(week.end)}): ${formatHoursValue(week.totalHours, mode)} (Reg: ${formatHoursValue(week.regularHours, mode)}, Supl: ${formatHoursValue(week.overtimeHours, mode)})`
        );
      }
    }

    const daily = Object.values(worker.daily).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (daily.length) {
      lines.push('  Zile:');
      for (const day of daily) {
        lines.push(
          `    ${formatDateRO(day.date)}: ${formatHoursValue(day.totalHours, mode)} (Reg: ${formatHoursValue(day.regularHours, mode)}, Supl: ${formatHoursValue(day.overtimeHours, mode)}) [${day.entries} schimb${day.entries === 1 ? '' : 'uri'}]`
        );
      }
    }

    lines.push('');
  }

  if (report.comparisons?.ranking?.length) {
    lines.push('Sumar comparativ:');
    report.comparisons.ranking.forEach((entry, idx) => {
      lines.push(
        `  ${idx + 1}. ${entry.worker} – ${formatHoursValue(entry.totalHours, mode)} (Reg: ${formatHoursValue(entry.regularHours, mode)}, Supl: ${formatHoursValue(entry.overtimeHours, mode)}, Ajustat: ${formatHoursValue(entry.weightedHours, mode)})`
      );
    });
    const totals = report.comparisons.totals;
    lines.push(
      `  Total general: ${formatHoursValue(totals.totalHours, mode)} (Reg: ${formatHoursValue(totals.regularHours, mode)}, Supl: ${formatHoursValue(totals.overtimeHours, mode)}, Ajustat: ${formatHoursValue(totals.weightedHours, mode)})`
    );
  }

  return lines.join('\n').trim();
}

function buildCsvRows(report) {
  const rows = [['Worker', 'Scope', 'Label', 'Total Hours', 'Regular Hours', 'Overtime Hours', 'Weighted Hours']];
  for (const workerName of Object.keys(report.workers)) {
    const worker = report.workers[workerName];
    rows.push([
      worker.name,
      'Total',
      'Perioadă selectată',
      worker.totals.totalHours.toFixed(2),
      worker.totals.regularHours.toFixed(2),
      worker.totals.overtimeHours.toFixed(2),
      worker.totals.weightedHours.toFixed(2)
    ]);

    for (const week of Object.values(worker.weekly)) {
      rows.push([
        worker.name,
        'Săptămână',
        `${week.key} (${week.start} - ${week.end})`,
        week.totalHours.toFixed(2),
        week.regularHours.toFixed(2),
        week.overtimeHours.toFixed(2),
        week.weightedHours.toFixed(2)
      ]);
    }

    for (const day of Object.values(worker.daily)) {
      rows.push([
        worker.name,
        'Zi',
        day.date,
        day.totalHours.toFixed(2),
        day.regularHours.toFixed(2),
        day.overtimeHours.toFixed(2),
        day.weightedHours.toFixed(2)
      ]);
    }
  }

  if (report.comparisons?.ranking?.length) {
    rows.push([]);
    rows.push(['Comparative Ranking']);
    rows.push(['Poz', 'Worker', 'Total Hours', 'Regular Hours', 'Overtime Hours', 'Weighted Hours']);
    report.comparisons.ranking.forEach((entry, idx) => {
      rows.push([
        idx + 1,
        entry.worker,
        entry.totalHours.toFixed(2),
        entry.regularHours.toFixed(2),
        entry.overtimeHours.toFixed(2),
        entry.weightedHours.toFixed(2)
      ]);
    });
    const totals = report.comparisons.totals;
    rows.push([
      '',
      'Total general',
      totals.totalHours.toFixed(2),
      totals.regularHours.toFixed(2),
      totals.overtimeHours.toFixed(2),
      totals.weightedHours.toFixed(2)
    ]);
  }

  return rows;
}

function exportReportToCSV(report, filePath) {
  const rows = buildCsvRows(report);
  const csv = rows
    .map(r => r.map(value => {
      if (value === undefined || value === null) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(','))
    .join('\n');
  fs.writeFileSync(filePath, csv, 'utf8');
  return filePath;
}

function exportReportToPDF(report, filePath, mode = 'hours-minutes') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(16).text('Raport pontaj', { align: 'center' });
    doc.moveDown();

    const text = formatReport(report, mode) || 'Nicio activitate pentru perioada selectată.';
    const lines = text.split('\n');
    doc.fontSize(11);
    for (const line of lines) {
      doc.text(line);
    }

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

async function exportReportToExcel(report, filePath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fișă de Pontaj';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Sumar');
  summarySheet.addRow(['Worker', 'Total ore', 'Ore regulate', 'Ore suplimentare', 'Ore ajustate']);
  report.comparisons.ranking.forEach(entry => {
    summarySheet.addRow([
      entry.worker,
      entry.totalHours,
      entry.regularHours,
      entry.overtimeHours,
      entry.weightedHours
    ]);
  });
  const totals = report.comparisons.totals;
  summarySheet.addRow(['Total general', totals.totalHours, totals.regularHours, totals.overtimeHours, totals.weightedHours]);
  summarySheet.columns.forEach(col => { if (col) col.width = 20; });

  for (const workerName of Object.keys(report.workers)) {
    const worker = report.workers[workerName];
    const sheetName = worker.name.substring(0, 31) || 'Angajat';
    const sheet = workbook.addWorksheet(sheetName);

    sheet.addRow(['Total perioadă', worker.totals.totalHours, worker.totals.regularHours, worker.totals.overtimeHours, worker.totals.weightedHours]);
    sheet.addRow([]);
    sheet.addRow(['Săptămânal']);
    sheet.addRow(['Săptămână', 'Start', 'Sfârșit', 'Total', 'Reg', 'Supl', 'Ajustat']);
    Object.values(worker.weekly)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .forEach(week => {
        sheet.addRow([week.key, week.start, week.end, week.totalHours, week.regularHours, week.overtimeHours, week.weightedHours]);
      });

    sheet.addRow([]);
    sheet.addRow(['Zilnic']);
    sheet.addRow(['Data', 'Total', 'Reg', 'Supl', 'Ajustat', 'Schimburi']);
    Object.values(worker.daily)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach(day => {
        sheet.addRow([day.date, day.totalHours, day.regularHours, day.overtimeHours, day.weightedHours, day.entries]);
      });

    sheet.columns.forEach(col => { if (col) col.width = 18; });
  }

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

async function exportReport(report, format, filePath, mode = 'hours-minutes') {
  if (!format) return null;
  const resolvedPath = path.resolve(filePath);
  switch (format) {
    case 'csv':
      exportReportToCSV(report, resolvedPath);
      return resolvedPath;
    case 'pdf':
      await exportReportToPDF(report, resolvedPath, mode);
      return resolvedPath;
    case 'excel':
    case 'xlsx':
      await exportReportToExcel(report, resolvedPath);
      return resolvedPath;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

function rowKey(row) {
  return [row.date || '', row.start || '', row.end || '', row.breakMin || 0, row.nextDay ? '1' : '0'].join('|');
}

function mergeRows(existing, incoming) {
  const seen = new Set(existing.map(rowKey));
  const merged = [...existing];
  for (const row of incoming) {
    const key = rowKey(row);
    if (!seen.has(key)) {
      merged.push(row);
      seen.add(key);
    }
  }
  return merged.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function normalizeDateValue(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const date = new Date((value - (25567 + 1)) * 86400 * 1000);
    if (!isNaN(date)) return date.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const parsed = parseDateInput(value);
    if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
  }
  return '';
}

function sanitizeImportedRow(row) {
  const date = normalizeDateValue(row.date || row.Date || row.data);
  const start = (row.start || row.Start || row.inceput || '').toString().trim();
  const end = (row.end || row.End || row.sfarsit || '').toString().trim();
  const breakMinRaw = row.breakMin ?? row.break ?? row['break(min)'] ?? row.pauza;
  const breakMin = Number(breakMinRaw || 0);
  const notes = (row.notes || row.Notes || row.observatii || '').toString();
  const nextDayRaw = row.nextDay ?? row['next day'] ?? row.ziUrmatoare;
  const nextDay = typeof nextDayRaw === 'string'
    ? /true|1|da|yes/i.test(nextDayRaw)
    : Boolean(nextDayRaw);

  if (!date || !start || !end) return null;
  return { date, start, end, breakMin: Number.isFinite(breakMin) ? breakMin : 0, notes, nextDay };
}

function parseImportedRowsFromCSV(content) {
  const records = parseCSV(content, { columns: true, skip_empty_lines: true, trim: true });
  return records.map(sanitizeImportedRow).filter(Boolean);
}

async function parseImportedRowsFromExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers = [];
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = cell.text || cell.value;
  });
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      record[header] = cell.value;
    });
    const sanitized = sanitizeImportedRow(record);
    if (sanitized) rows.push(sanitized);
  });
  return rows;
}

function parseImportedRowsFromJSON(content) {
  const data = JSON.parse(content);
  if (Array.isArray(data)) {
    return data.map(sanitizeImportedRow).filter(Boolean);
  }
  if (data && Array.isArray(data.rows)) {
    return data.rows.map(sanitizeImportedRow).filter(Boolean);
  }
  throw new Error('JSON import must be an array of rows or an object with a "rows" array.');
}

async function importTimesheet({ filePath, format, worker, dataDir, targetFile }) {
  if (!filePath) throw new Error('No import file provided.');
  if (!worker) throw new Error('Import requires --import-worker to specify the employee name.');

  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dataDir);
  const ext = path.extname(resolvedFile).toLowerCase();
  const detectedFormat = format || (ext === '.csv' ? 'csv' : ext === '.xlsx' ? 'xlsx' : ext === '.json' ? 'json' : null);
  if (!detectedFormat) {
    throw new Error('Unable to determine import format. Use --import-format to specify csv, xlsx or json.');
  }

  let rows = [];
  if (detectedFormat === 'csv') {
    const content = fs.readFileSync(resolvedFile, 'utf8');
    rows = parseImportedRowsFromCSV(content);
  } else if (detectedFormat === 'json') {
    const content = fs.readFileSync(resolvedFile, 'utf8');
    rows = parseImportedRowsFromJSON(content);
  } else if (detectedFormat === 'xlsx' || detectedFormat === 'excel') {
    const buffer = fs.readFileSync(resolvedFile);
    rows = await parseImportedRowsFromExcel(buffer);
  } else {
    throw new Error(`Unsupported import format: ${detectedFormat}`);
  }

  if (!rows.length) {
    throw new Error('No valid rows found in import file.');
  }

  const slug = slugify(worker);
  const targetName = targetFile ? targetFile : `pontaj_${slug}.json`;
  const outputPath = path.join(resolvedDir, targetName);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  let existing = null;
  try {
    existing = loadJson(outputPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const existingRows = existing?.rows || [];
  const merged = mergeRows(existingRows, rows);
  const result = {
    meta: {
      ...(existing?.meta || {}),
      worker,
      lastUpdated: new Date().toISOString(),
      version: existing?.meta?.version || '3.4',
      importedFrom: path.basename(resolvedFile)
    },
    rows: merged
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}

if (require.main === module) {
  program
    .option('--from <date>', 'start date (DD/MM/YYYY or YYYY-MM-DD)')
    .option('--to <date>', 'end date (DD/MM/YYYY or YYYY-MM-DD)')
    .option('--dir <path>', 'directory with timesheets', path.join(__dirname, 'data'))
    .option('--format <type>', 'output format (decimal or hours-minutes)', 'decimal')
    .option('--export <type>', 'export report to csv, pdf or excel')
    .option('--output <file>', 'output path when exporting report')
    .option('--overtime-threshold <hours>', 'overtime threshold in hours per day', parseFloat, DEFAULT_OVERTIME_THRESHOLD)
    .option('--overtime-rate <multiplier>', 'overtime rate multiplier', parseFloat, DEFAULT_OVERTIME_RATE)
    .option('--import <file>', 'import timesheet rows from file')
    .option('--import-format <type>', 'import format (csv, xlsx, json)')
    .option('--import-worker <name>', 'worker name for imported rows')
    .option('--import-target <file>', 'custom output filename (relative to --dir) for imported data');

  program.parse(process.argv);

  const opts = program.opts();

  (async () => {
    if (opts.import) {
      try {
        const importedPath = await importTimesheet({
          filePath: opts.import,
          format: opts.importFormat,
          worker: opts.importWorker,
          dataDir: opts.dir || path.join(__dirname, 'data'),
          targetFile: opts.importTarget
        });
        console.log(`Imported rows saved to ${importedPath}`);
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      return;
    }

    if (!opts.from || !opts.to) {
      console.error('Both --from and --to must be provided when generating reports.');
      process.exit(1);
    }

    const fromDate = parseDateInput(opts.from);
    const toDate = parseDateInput(opts.to);

    if (isNaN(fromDate)) {
      console.error(`Invalid --from date: ${opts.from}`);
      process.exit(1);
    }

    if (isNaN(toDate)) {
      console.error(`Invalid --to date: ${opts.to}`);
      process.exit(1);
    }

    if (fromDate > toDate) {
      console.error('--from date must be less than or equal to --to date');
      process.exit(1);
    }

    try {
      const report = generateReport(opts.dir || path.join(__dirname, 'data'), fromDate, toDate, {
        overtimeThreshold: opts.overtimeThreshold,
        overtimeRate: opts.overtimeRate
      });
      const formatted = formatReport(report, opts.format);
      if (opts.export) {
        if (!opts.output) {
          console.error('When using --export you must also provide --output.');
          process.exit(1);
        }
        await exportReport(report, opts.export, opts.output, opts.format);
        console.log(`Report exported to ${path.resolve(opts.output)}`);
      } else if (formatted) {
        console.log(formatted);
      } else {
        console.log('No activity found for selected period.');
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = {
  DEFAULT_OVERTIME_THRESHOLD,
  DEFAULT_OVERTIME_RATE,
  buildReport,
  generateReport,
  formatReport,
  computeHours,
  computeDailyStats,
  parseTime,
  parseDateInput,
  exportReportToCSV,
  exportReportToExcel,
  exportReportToPDF,
  exportReport,
  importTimesheet
};
