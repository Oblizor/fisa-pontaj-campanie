# Fisa Pontaj Campanie

## Running Tests

Install dependencies and run the test suite:

```bash
npm install
npm test
```

## Generating Activity Reports

Use the `report.js` script to aggregate hours for all employees over a period. The `--from` and `--to` options are required; `--dir` defaults to the bundled `data` folder.

```bash
node report.js --from 2025-09-01 --to 2025-09-30
```

Run `--help` to see all available options:

```bash
node report.js --help
```

Adjust the date range to cover weekly, monthly, or custom spans. The script scans the chosen directory and prints hours per day for each worker.

## Example output

```
Alice
  2025-09-01: 7.50h
  2025-09-05: 7.00h

bob
  2025-09-02: 4.00h
```

For date ranges without any activity, the script prints:

```
No activity found for selected period.
```
