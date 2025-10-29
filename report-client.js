export const DEFAULT_OVERTIME_THRESHOLD = 8;
export const DEFAULT_OVERTIME_RATE = 1.5;

export function parseTime(str) {
  const [h, m] = (str || '0:0').split(':').map(Number);
  return h * 60 + m;
}

export function computeHours(row) {
  if (!row.start || !row.end) return 0;
  let start = parseTime(row.start);
  let end = parseTime(row.end);
  if (row.nextDay || end < start) {
    end += 24 * 60;
  }
  const breakMin = row.breakMin || 0;
  return Math.max(0, (end - start - breakMin) / 60);
}

export function computeDailyStats(row, overtimeThreshold = DEFAULT_OVERTIME_THRESHOLD, overtimeRate = DEFAULT_OVERTIME_RATE) {
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

export function generateReport(timesheets = [], fromDate, toDate, options = {}) {
  const {
    overtimeThreshold = DEFAULT_OVERTIME_THRESHOLD,
    overtimeRate = DEFAULT_OVERTIME_RATE
  } = options;

  const from = fromDate ? parseDateInput(fromDate) : null;
  const to = toDate ? parseDateInput(toDate) : null;

  const report = {
    metadata: {
      from: from && !isNaN(from) ? from.toISOString().slice(0, 10) : null,
      to: to && !isNaN(to) ? to.toISOString().slice(0, 10) : null,
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
      if (from && !isNaN(from) && dateObj < from) continue;
      if (to && !isNaN(to) && dateObj > to) continue;

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

export function formatReport(report, mode = 'decimal') {
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
        lines.push(`    ${week.key} (${formatDateRO(week.start)} - ${formatDateRO(week.end)}): ${formatHoursValue(week.totalHours, mode)} (Reg: ${formatHoursValue(week.regularHours, mode)}, Supl: ${formatHoursValue(week.overtimeHours, mode)})`);
      }
    }

    const daily = Object.values(worker.daily).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (daily.length) {
      lines.push('  Zile:');
      for (const day of daily) {
        lines.push(`    ${formatDateRO(day.date)}: ${formatHoursValue(day.totalHours, mode)} (Reg: ${formatHoursValue(day.regularHours, mode)}, Supl: ${formatHoursValue(day.overtimeHours, mode)}) [${day.entries} schimb${day.entries === 1 ? '' : 'uri'}]`);
      }
    }

    lines.push('');
  }

  if (report.comparisons?.ranking?.length) {
    lines.push('Sumar comparativ:');
    report.comparisons.ranking.forEach((entry, idx) => {
      lines.push(`  ${idx + 1}. ${entry.worker} – ${formatHoursValue(entry.totalHours, mode)} (Reg: ${formatHoursValue(entry.regularHours, mode)}, Supl: ${formatHoursValue(entry.overtimeHours, mode)}, Ajustat: ${formatHoursValue(entry.weightedHours, mode)})`);
    });
    const totals = report.comparisons.totals;
    lines.push(`  Total general: ${formatHoursValue(totals.totalHours, mode)} (Reg: ${formatHoursValue(totals.regularHours, mode)}, Supl: ${formatHoursValue(totals.overtimeHours, mode)}, Ajustat: ${formatHoursValue(totals.weightedHours, mode)})`);
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

function csvFromRows(rows) {
  return rows
    .map(r => r.map(value => {
      if (value === undefined || value === null) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(','))
    .join('\n');
}

function downloadBlob(content, mimeType, fileName) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReportToCsv(report, fileName = 'raport.csv') {
  const csv = csvFromRows(buildCsvRows(report));
  downloadBlob(csv, 'text/csv;charset=utf-8;', fileName);
}

export async function exportReportToPdf(report, fileName = 'raport.pdf', mode = 'hours-minutes') {
  if (!window.PDFLib) {
    throw new Error('Biblioteca PDFLib nu este disponibilă. Asigură-te că scriptul pdf-lib este încărcat.');
  }
  const { PDFDocument, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontSize = 11;
  const margin = 40;
  let y = page.getHeight() - margin;

  const addPage = () => {
    const newPage = pdfDoc.addPage();
    y = newPage.getHeight() - margin;
    return newPage;
  };

  const text = formatReport(report, mode) || 'Nicio activitate pentru perioada selectată.';
  const lines = text.split('\n');
  let currentPage = page;
  currentPage.drawText('Raport pontaj', { x: margin, y, size: 16, font });
  y -= 24;

  lines.forEach(line => {
    if (y < margin) {
      currentPage = addPage();
    }
    currentPage.drawText(line, { x: margin, y, size: fontSize, font });
    y -= fontSize + 4;
  });

  const pdfBytes = await pdfDoc.save();
  downloadBlob(pdfBytes, 'application/pdf', fileName);
}

export async function exportReportToExcel(report, fileName = 'raport.xlsx') {
  if (!window.XLSX) {
    throw new Error('Biblioteca XLSX nu este disponibilă. Asigură-te că scriptul xlsx este încărcat.');
  }
  const rows = buildCsvRows(report);
  const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Raport');
  const wbout = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  downloadBlob(wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
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

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map(value => value.trim());
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(cell => cell.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    const record = {};
    headers.forEach((header, idx) => {
      const raw = values[idx] ?? '';
      record[header] = raw.replace(/^"|"$/g, '');
    });
    return record;
  });
}

function parseJson(content) {
  const data = JSON.parse(content);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  throw new Error('Fișierul JSON trebuie să conțină un array sau o proprietate "rows".');
}

function parseExcel(arrayBuffer) {
  if (!window.XLSX) {
    throw new Error('Biblioteca XLSX nu este disponibilă. Asigură-te că scriptul xlsx este încărcat.');
  }
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

export async function importTimesheetFile(file) {
  const name = file.name.toLowerCase();
  let rows = [];
  if (name.endsWith('.csv')) {
    const text = await readFileAsText(file);
    rows = parseCsv(text);
  } else if (name.endsWith('.json')) {
    const text = await readFileAsText(file);
    rows = parseJson(text);
  } else if (name.endsWith('.xlsx')) {
    const buffer = await readFileAsArrayBuffer(file);
    rows = parseExcel(buffer);
  } else {
    throw new Error('Format de fișier neacceptat. Folosește CSV, JSON sau XLSX.');
  }

  const sanitized = rows.map(sanitizeImportedRow).filter(Boolean);
  if (!sanitized.length) {
    throw new Error('Nu au fost găsite rânduri valide în fișier.');
  }
  return sanitized;
}
