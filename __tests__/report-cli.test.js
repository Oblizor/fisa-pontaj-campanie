const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('report CLI argument validation', () => {
  test('malformed dates cause errors', () => {
    try {
      execFileSync('node', ['report.js', '--from', 'bad', '--to', '2025-01-01'], { encoding: 'utf8' });
      throw new Error('Expected command to fail');
    } catch (err) {
      expect(err.status).not.toBe(0);
      expect(err.stderr).toMatch(/Invalid --from date/);
    }

    try {
      execFileSync('node', ['report.js', '--from', '2025-01-01', '--to', 'bad'], { encoding: 'utf8' });
      throw new Error('Expected command to fail');
    } catch (err) {
      expect(err.status).not.toBe(0);
      expect(err.stderr).toMatch(/Invalid --to date/);
    }
  });

  test('reversed date range causes error', () => {
    try {
      execFileSync('node', ['report.js', '--from', '2025-02-01', '--to', '2025-01-01'], { encoding: 'utf8' });
      throw new Error('Expected command to fail');
    } catch (err) {
      expect(err.status).not.toBe(0);
      expect(err.stderr).toMatch(/must be less than or equal/);
    }
  });

  test('missing data directory causes descriptive error', () => {
    const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pontaj-missing-cli-'));
    fs.rmSync(missingDir, { recursive: true, force: true });
    try {
      execFileSync('node', ['report.js', '--from', '2025-09-01', '--to', '2025-09-30', '--dir', missingDir], {
        encoding: 'utf8'
      });
      throw new Error('Expected command to fail');
    } catch (err) {
      expect(err.status).not.toBe(0);
      expect(err.stderr).toContain(`Data directory not found: ${missingDir}`);
    }
  });
});

