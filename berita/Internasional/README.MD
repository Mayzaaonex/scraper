# HOW TO USE - INTERNATIONAL NEWS SCRAPERS

## Requirements

- Node.js (v16 or newer recommended)
- No external dependencies - uses Node's built-in `https` module only
- No `npm install` needed

## Usage

```bash
node bbc.js [count]
node guardian.js [count]
node aljazeera.js [count]
```

`[count]` is optional - number of articles to fetch.
If left empty, it defaults to 10 articles.

## Examples

```bash
node bbc.js 1
node bbc.js 100
node bbc.js        # no count = defaults to 10 articles
```

Output is a JSON array printed to the terminal.

## Scraper List

| File | Source | Method |
|---|---|---|
| `bbc.js` | BBC News | RSS |
| `guardian.js` | The Guardian (World) | RSS |
| `aljazeera.js` | Al Jazeera | RSS |

## Adding a New Scraper

Drop the file into this folder, follow the same RSS parsing pattern used in `bbc.js`.
