# HOW TO USE - LOCAL NEWS SCRAPERS

## Requirements

- Node.js (v16 or newer recommended)
- No external dependencies - uses Node's built-in `https` module only
- No `npm install` needed

## Usage

```bash
node cnn.js [count]
node compas.js [count]
node antara.js [count]
```

`[count]` is optional - number of articles to fetch.
If left empty, it defaults to 10 articles.

## Examples

```bash
node cnn.js 1
node cnn.js 100
node cnn.js        # no count = defaults to 10 articles
```

Output is a JSON array printed to the terminal.

## Scraper List

| File | Source | Method |
|---|---|---|
| `cnn.js` | CNN Indonesia | RSS |
| `compas.js` | Kompas | HTML scrape (indeks.kompas.com) |
| `antara.js` | ANTARA News | RSS |

## Adding a New Scraper

Drop the file into this folder, follow the same pattern as `cnn.js` (RSS-based) or `compas.js` (HTML-based).
