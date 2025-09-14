const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { generateReport } = require('../report');

test('generateReport aggregates hours within range', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pontaj-test-'));
  try {
    const workerA = {
      meta: { worker: 'Alice' },
      rows: [
        { date: '2025-09-01', start: '08:00', end: '16:00', nextDay: false, breakMin: 30 },
        { date: '2025-09-05', start: '09:00', end: '17:00', nextDay: false, breakMin: 60 }
      ]
    };
    const workerB = {
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
    expect(report.bob['2025-09-02']).toBeCloseTo(4); // Cross midnight shift
    expect(report.bob['2025-10-01']).toBeUndefined();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI reports hours and shows no activity when appropriate', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pontaj-cli-test-'));
  try {
    const workerA = {
      meta: { worker: 'Alice' },
      rows: [
        { date: '2025-09-01', start: '08:00', end: '16:00', nextDay: false, breakMin: 30 },
        { date: '2025-09-05', start: '09:00', end: '17:00', nextDay: false, breakMin: 60 }
      ]
    };
    const workerB = {
      rows: [
        { date: '2025-09-02', start: '22:00', end: '02:00', nextDay: true, breakMin: 0 }
      ]
    };
    fs.writeFileSync(path.join(tmpDir, 'pontaj_alice.json'), JSON.stringify(workerA));
    fs.writeFileSync(path.join(tmpDir, 'pontaj_bob.json'), JSON.stringify(workerB));

    const out = execFileSync('node', ['report.js', '--from', '2025-09-01', '--to', '2025-09-30', '--dir', tmpDir], { encoding: 'utf8' }).trim();
    expect(out).toBe(
      ['Alice',
       '  01/09/2025: 7.50h',
       '  05/09/2025: 7.00h',
       '',
       'bob',
       '  02/09/2025: 4.00h'].join('\n')
    );

    const noActivity = execFileSync('node', ['report.js', '--from', '2025-08-01', '--to', '2025-08-31', '--dir', tmpDir], { encoding: 'utf8' }).trim();
    expect(noActivity).toBe('No activity found for selected period.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('generateReport throws descriptive error when directory missing', () => {
  const missingDir = path.join(os.tmpdir(), 'pontaj-missing-test-');
  fs.rmSync(missingDir, { recursive: true, force: true });
  expect(() => generateReport(missingDir, '2025-01-01', '2025-01-02'))
    .toThrow(`Data directory not found: ${missingDir}`);
});
