# Fisa Pontaj Campanie

## Running Tests

Install dependencies and run the test suite:

```bash
npm install
npm test
```

## Generating Activity Reports

Use the `report.js` script to aggregate hours for all employees over a period.

```bash
node report.js --from 2025-09-01 --to 2025-09-30
```
The script scans the `data` folder and prints hours per day for each worker. Adjust the `--from` and `--to` dates to cover weekly, monthly, or custom ranges. Use `--dir <path>` to analyze a different data directory.

If no entries match the period, it outputs `No activity found for selected period.`
