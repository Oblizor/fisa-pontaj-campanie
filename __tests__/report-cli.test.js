const { execFileSync } = require('child_process');

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
});

