const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const {
  generateReport,
  importTimesheet
} = require('../report');

function writeTimesheet(dir, filename, data) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data));
}

describe('advanced reporting', () => {
  test('generateReport builds daily, weekly and overtime summaries', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pontaj-test-'));
    try {
      writeTimesheet(tmpDir, 'pontaj_alice.json', {
        meta: { worker: 'Alice' },
        rows: [
          { date: '2025-09-01', start: '08:00', end: '18:00', breakMin: 60 }, // 9h -> 8 regular, 1 overtime
          { date: '2025-09-02', start: '07:00', end: '21:00', breakMin: 30 } // 13.5h -> 8 regular, 5.5 overtime
        ]
      });
      writeTimesheet(tmpDir, 'pontaj_bob.json', {
        meta: { worker: 'Bob' },
        rows: [
          { date: '2025-09-03', start: '22:00', end: '06:00', nextDay: true, breakMin: 0 }
        ]
      });

      const report = generateReport(tmpDir, '2025-09-01', '2025-09-07');

      const alice = report.workers.Alice;
      expect(alice.totals.totalHours).toBeCloseTo(22.5);
      expect(alice.totals.regularHours).toBeCloseTo(16);
      expect(alice.totals.overtimeHours).toBeCloseTo(6.5);
      expect(alice.daily['2025-09-01'].overtimeHours).toBeCloseTo(1);
      expect(alice.daily['2025-09-02'].overtimeHours).toBeCloseTo(5.5);
      const aliceWeeks = Object.values(alice.weekly);
      expect(aliceWeeks).toHaveLength(1);
      expect(aliceWeeks[0].totalHours).toBeCloseTo(22.5);

      const bob = report.workers.Bob;
      expect(bob.totals.totalHours).toBeCloseTo(8);
      expect(bob.daily['2025-09-03'].totalHours).toBeCloseTo(8);

      expect(report.comparisons.totals.totalHours).toBeCloseTo(30.5);
      expect(report.comparisons.ranking[0].worker).toBe('Alice');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('CLI format output includes summaries', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pontaj-cli-test-'));
    try {
      writeTimesheet(tmpDir, 'pontaj_alice.json', {
        meta: { worker: 'Alice' },
        rows: [
          { date: '2025-09-01', start: '08:00', end: '16:00', breakMin: 30 }
        ]
      });
      writeTimesheet(tmpDir, 'pontaj_bob.json', {
        meta: { worker: 'bob' },
        rows: [
          { date: '2025-09-02', start: '22:00', end: '02:00', nextDay: true, breakMin: 0 }
        ]
      });

      const output = execFileSync('node', [
        'report.js',
        '--from', '01/09/2025',
        '--to', '30/09/2025',
        '--dir', tmpDir,
        '--format', 'hours-minutes'
      ], { encoding: 'utf8' }).trim();

      const expected = [
        'Alice',
        '  Total perioadă: 7 h 30 m (Reg: 7 h 30 m, Supl: 0 h 00 m, Ajustat: 7 h 30 m)',
        '  Săptămâni:',
        '    2025-W35 (01/09/2025 - 07/09/2025): 7 h 30 m (Reg: 7 h 30 m, Supl: 0 h 00 m)',
        '  Zile:',
        '    01/09/2025: 7 h 30 m (Reg: 7 h 30 m, Supl: 0 h 00 m) [1 schimb]',
        '',
        'bob',
        '  Total perioadă: 4 h 00 m (Reg: 4 h 00 m, Supl: 0 h 00 m, Ajustat: 4 h 00 m)',
        '  Săptămâni:',
        '    2025-W35 (01/09/2025 - 07/09/2025): 4 h 00 m (Reg: 4 h 00 m, Supl: 0 h 00 m)',
        '  Zile:',
        '    02/09/2025: 4 h 00 m (Reg: 4 h 00 m, Supl: 0 h 00 m) [1 schimb]',
        '',
        'Sumar comparativ:',
        '  1. Alice – 7 h 30 m (Reg: 7 h 30 m, Supl: 0 h 00 m, Ajustat: 7 h 30 m)',
        '  2. bob – 4 h 00 m (Reg: 4 h 00 m, Supl: 0 h 00 m, Ajustat: 4 h 00 m)',
        '  Total general: 11 h 30 m (Reg: 11 h 30 m, Supl: 0 h 00 m, Ajustat: 11 h 30 m)'
      ].join('\n');

      expect(output).toBe(expected);

      const noActivity = execFileSync('node', [
        'report.js',
        '--from', '01/08/2025',
        '--to', '31/08/2025',
        '--dir', tmpDir
      ], { encoding: 'utf8' }).trim();
      expect(noActivity).toBe('No activity found for selected period.');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('importTimesheet merges rows from CSV', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pontaj-import-test-'));
    const dataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(dataDir);
    const csvPath = path.join(tmpDir, 'rows.csv');
    fs.writeFileSync(csvPath, 'date,start,end,breakMin\n2025-09-10,08:00,16:00,30\n2025-09-11,07:00,15:00,15\n');

    writeTimesheet(dataDir, 'pontaj_alice.json', {
      meta: { worker: 'Alice', version: '3.4' },
      rows: [{ date: '2025-09-09', start: '08:00', end: '14:00', breakMin: 0 }]
    });

    const outputPath = await importTimesheet({
      filePath: csvPath,
      worker: 'Alice',
      dataDir
    });

    const result = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(result.rows).toHaveLength(3);
    expect(result.rows[1].date).toBe('2025-09-10');
    expect(result.rows[2].date).toBe('2025-09-11');
  });

  test('generateReport throws descriptive error when directory missing', () => {
    const missingDir = path.join(os.tmpdir(), `pontaj-missing-${Date.now()}`);
    fs.rmSync(missingDir, { recursive: true, force: true });
    expect(() => generateReport(missingDir, '2025-01-01', '2025-01-02'))
      .toThrow(`Data directory not found: ${missingDir}`);
  });
});
