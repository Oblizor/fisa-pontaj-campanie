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
  01/09/2025: 7 h 30 m
  05/09/2025: 7 h 00 m

bob
  02/09/2025: 4 h 00 m
```

For date ranges without any activity, the script prints:

```
No activity found for selected period.
```

## Gestionare vin (prototip)

Pagina `bazine.html` oferă un prototip de aplicație pentru gestionarea vinului într-o cramă. Poți defini bazine cu capacitate și volum curent, loturi de vin și poți înregistra operații de umplere, transvazare și tratamente. Datele sunt salvate în `localStorage`, iar istoricul fiecărui bazin și lot poate fi consultat rapid.

Deschide `home.html` și urmează linkul "Crama" pentru a accesa aplicația.
