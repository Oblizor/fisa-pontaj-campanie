# Fisa Pontaj Campanie

## Running Tests

Install dependencies and run the test suite:

```bash
npm install
npm test
```

## Generating Activity Reports

Use the `report.js` script to aggregate hours for all employees over a period. The `--from` and `--to` options are required and accept dates in `DD/MM/YYYY` or `YYYY-MM-DD` format; `--dir` defaults to the bundled `data` folder. Durations are printed in decimal hours by default, or in an `H h MM m` style when you pass `--format hours-minutes`.

```bash
node report.js --from 01/09/2025 --to 30/09/2025
```

Run `--help` to see all available options:

```bash
node report.js --help
```

Adjust the date range to cover weekly, monthly, or custom spans. The script scans the chosen directory and prints hours per day for each worker.

### Example output (decimal hours)

```
Alice
  01/09/2025: 7.50h
```

For date ranges without any activity, the script prints:

```
No activity found for selected period.
```

## Gestionare vin (prototip)

Pagina `bazine.html` oferă un prototip de aplicație pentru gestionarea vinului într-o cramă. Poți defini bazine cu capacitate și volum curent, loturi de vin și poți înregistra operații de umplere, transvazare și tratamente. Datele sunt salvate în `localStorage`, iar istoricul fiecărui bazin și lot poate fi consultat rapid.

Deschide `home.html` și urmează linkul "Crama" pentru a accesa aplicația.
