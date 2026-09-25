# HOW TO USE - NEWS SCRAPERS

All scripts run with Node.js:

```bash
node cnnindonesia.js [count]
node kompas.js [count]
node antara.js [count]
```

`[count]` is optional - number of articles to fetch.
If left empty, it defaults to 10 articles.

## Examples

```bash
node cnnindonesia.js 1
node cnnindonesia.js 100
node cnnindonesia.js        # no count = defaults to 10 articles
```

Output is a JSON array printed to the terminal.

## Scraper List

| File | Source |
|---|---|
| `cnnindonesia.js` | CNN Indonesia |
| `kompas.js` | Kompas |
| `antara.js` | Antara |

## Adding a New Scraper

Drop the file into this folder, follow the same pattern as `cnnindonesia.js`.
