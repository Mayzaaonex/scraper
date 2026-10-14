# nasa.js

A single-file, menu-driven CLI scraper for NASA content. It bundles five scrapers — homepage, blogs, news releases, podcasts/audio, and NASA+ series — behind one entry point with simple subcommands.

Running it with no arguments prints the menu of available commands.

## Features

- `home` — Scrape the NASA homepage (hero, featured news, callouts, card grids, image of the day, stories)
- `blog` — List NASA blogs from nasa.gov/nasa-blogs
- `news` — Fetch the latest NASA news releases (recently-published, paginated)
- `podcast` — Scrape all NASA podcast/audio sources (Artemis Audio, Historical Sounds, Data Sonifications, Sounds from Beyond, etc.)
- `series` — Scrape NASA+ series and their episodes from plus.nasa.gov

All commands print JSON to stdout (pretty-printed by default).

## Requirements

- [Node.js](https://nodejs.org/) v16 or later
- npm (comes with Node.js)

### Dependencies

| Package   | Used for                                    |
|-----------|----------------------------------------------|
| [`axios`](https://www.npmjs.com/package/axios)     | HTTP requests to nasa.gov / plus.nasa.gov |
| [`cheerio`](https://www.npmjs.com/package/cheerio) | HTML parsing for the `home` command       |

## Installation

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
npm install axios cheerio
```

Or, if you keep a `package.json` in the repo:

```bash
npm install
```

## Usage

```bash
node nasa.js                  # show the menu
```

### home

```bash
node nasa.js home              # all items, pretty-printed
node nasa.js home 4            # max 4 items per section
node nasa.js home 4 --compact  # single-line JSON output
```

### blog

```bash
node nasa.js blog                    # all blogs
node nasa.js blog 5                  # first 5 blogs
node nasa.js blog 5 --out=blogs.json # save to a file
```

### news

```bash
node nasa.js news              # 1 page (~25 most recent news releases)
node nasa.js news 5            # first 5 pages
node nasa.js news 1 --out=news.json
```

### podcast

```bash
node nasa.js podcast                 # scrape every audio source
node nasa.js podcast --only=artemis  # scrape one source only
node nasa.js podcast --list          # list available sources only
```

### series

```bash
node nasa.js series                  # all series + episodes
node nasa.js series --only=moonbound # one series only
node nasa.js series --list           # list series only, no episodes
node nasa.js series --no-episodes    # series metadata without episode details
```

### Common flags

| Flag             | Description                                      | Supported by                  |
|-------------------|--------------------------------------------------|--------------------------------|
| `--compact`       | Print JSON on a single line instead of pretty-printed | all commands              |
| `--out=<file>`    | Save output to a file instead of stdout          | `blog`, `news`, `podcast`, `series` |
| `--only=<slug>`   | Limit to one source/series                       | `podcast`, `series`            |
| `--list`          | List sources/series only, skip scraping details  | `podcast`, `series`            |
| `--no-episodes`   | Skip episode details                             | `series`                       |

## Notes

- All data is scraped from public NASA pages/APIs (`nasa.gov`, `plus.nasa.gov`); there is no official API key required.
- Output fields use Indonesian keys (e.g. `judul`, `tanggal`, `gambar`) since the scrapers were originally written for an Indonesian-language project.
- Network requests use retry logic with backoff; transient failures are retried automatically before the command exits with an error.

## License

Add a license of your choice (e.g. MIT) before publishing.
