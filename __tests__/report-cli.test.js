const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const cli = path.join(__dirname, '..', 'report.js');

test('CLI prints report for given directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pontaj-cli-'));
  const worker = {
    meta: { worker: 'Alice' },
    rows: [
      { date: '2025-09-01', start: '08:00', end: '12:00', nextDay: false, breakMin: 0 }
    ]
  };
  fs.writeFileSync(path.join(tmpDir, 'pontaj_alice.json'), JSON.stringify(worker));

  const result = spawnSync('node', [cli, '--dir', tmpDir, '--from', '2025-09-01', '--to', '2025-09-30'], { encoding: 'utf8' });
  expect(result.stdout).toContain('Alice');
  expect(result.stdout).toContain('2025-09-01: 4.00h');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CLI outputs no activity message for empty directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pontaj-cli-'));
  const result = spawnSync('node', [cli, '--dir', tmpDir, '--from', '2025-09-01', '--to', '2025-09-30'], { encoding: 'utf8' });
  expect(result.stdout.trim()).toBe('No activity found for selected period.');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

