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

function formatHM(hours) {
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h} h ${m.toString().padStart(2, '0')} m`;
}

export function generateReport(timesheets = [], fromDate, toDate) {
  const from = fromDate ? new Date(fromDate) : null;
  const to = toDate ? new Date(toDate) : null;
  const report = {};
  for (const sheet of timesheets) {
    const worker = sheet.meta?.worker || 'necunoscut';
    for (const row of sheet.rows || []) {
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

export function formatReport(rep) {
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
      out += `  ${dateFmt}: ${formatHM(rep[worker][d])}\n`;
    }
  }
  return out.trim();
}
