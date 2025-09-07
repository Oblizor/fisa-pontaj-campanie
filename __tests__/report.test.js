const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateReport, formatReport } = require('../report');

test('generateReport aggregates hours within range', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pontaj-test-'));
  const workerA = {
    meta: { worker: 'Alice' },
    rows: [
      { date: '2025-09-01', start: '08:00', end: '16:00', nextDay: false, breakMin: 30 },
      { date: '2025-09-05', start: '09:00', end: '17:00', nextDay: false, breakMin: 60 }
    ]
  };
  const workerB = {
    meta: { worker: 'Bob' },
    rows: [
      { date: '2025-09-02', start: '22:00', end: '02:00', nextDay: true, breakMin: 0 },
      { date: '2025-10-01', start: '08:00', end: '12:00', nextDay: false, breakMin: 0 }
    ]
  };
  fs.writeFileSync(path.join(tmpDir, 'pontaj_alice.json'), JSON.stringify(workerA));
  fs.writeFileSync(path.join(tmpDir, 'pontaj_bob.json'), JSON.stringify(workerB));

  const report = generateReport(tmpDir, '2025-09-01', '2025-09-30');
  expect(report.Alice['2025-09-01']).toBeCloseTo(7.5); // 8h minus 30min break
  expect(report.Alice['2025-09-05']).toBeCloseTo(7); // 8h minus 1h break
  expect(report.Bob['2025-09-02']).toBeCloseTo(4); // Cross midnight shift
  expect(report.Bob['2025-10-01']).toBeUndefined();
});

test('formatReport warns when no activity', () => {
  const message = formatReport({});
  expect(message).toBe('No activity found for selected period.');
});
