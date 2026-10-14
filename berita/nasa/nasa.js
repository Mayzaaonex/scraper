#!/usr/bin/env node
/**
 * nasa.js — Gabungan semua scraper NASA jadi 1 file, dengan menu.
 *
 * Catatan: dari 2 scraper berita yang isinya mirip (newrelease.js & recentlypublish.js),
 * yang dipakai di sini cuma yang PALING BARU (recentlypublish.js) → command "news".
 *
 * Usage:
 *   node nasa.js                         # tampilkan menu
 *   node nasa.js home   [jumlah] [--compact]
 *   node nasa.js blog   [jumlah] [--compact] [--out=file.json]
 *   node nasa.js news   [halaman] [--compact] [--out=file.json]
 *   node nasa.js podcast [--compact] [--out=file.json] [--only=slug] [--list]
 *   node nasa.js series  [--compact] [--out=file.json] [--only=slug] [--list] [--no-episodes]
 *
 * Dependencies: axios, cheerio
 *   npm install axios cheerio
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ================== MENU ==================
const MENU = `
🚀 nasa.js — scraper NASA (menu)

Pemakaian:
  node nasa.js <command> [opsi]

Command yang tersedia:
  home     Scraper homepage NASA
             node nasa.js home              # semua item, pretty print
             node nasa.js home 4            # max 4 item per section
             node nasa.js home 4 --compact  # output 1 baris

  blog     Daftar blog NASA (nasa.gov/nasa-blogs)
             node nasa.js blog                    # semua blog
             node nasa.js blog 5                  # 5 blog pertama
             node nasa.js blog 5 --out=blogs.json

  news     Berita terbaru NASA (recently-published)
             node nasa.js news              # 1 halaman (~25 berita terbaru)
             node nasa.js news 5            # 5 halaman pertama
             node nasa.js news 1 --out=hasil.json

  podcast  Semua audio/podcast NASA
             node nasa.js podcast
             node nasa.js podcast --only=artemis
             node nasa.js podcast --list          # cuma list sumber

  series   Semua series + episode NASA+ (plus.nasa.gov)
             node nasa.js series
             node nasa.js series --only=moonbound
             node nasa.js series --list           # cuma daftar series
             node nasa.js series --no-episodes

Opsi umum: --compact (JSON 1 baris), --out=<file> (simpan ke file, kalau didukung)
`;

// ===================================================================
// ========================= COMMAND: home ==========================
// ===================================================================
async function cmdHome(args) {
  const angkaArg = args.find((a) => /^\d+$/.test(a));
  const JUMLAH_DIMINTA = angkaArg ? parseInt(angkaArg, 10) : Infinity;
  const COMPACT = args.includes('--compact');

  if (args.length && args.some((a) => !a.startsWith('--') && isNaN(parseInt(a, 10)))) {
    process.stderr.write(
      JSON.stringify({ error: 'Argumen harus angka. Contoh: node nasa.js home 4' }) + '\n'
    );
    process.exit(1);
  }

  const PAGE_ID = 128943;
  const API_URL = `https://www.nasa.gov/wp-json/wp/v2/pages/${PAGE_ID}`;

  const http = axios.create({
    timeout: 60000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.nasa.gov/',
      'Origin': 'https://www.nasa.gov',
    },
  });

  async function fetchWithRetry(url, maxRetry = 3) {
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        return await http.get(url);
      } catch (err) {
        if (attempt === maxRetry) throw err;
        await new Promise((r) => setTimeout(r, attempt * 3000));
      }
    }
  }

  const clean = (t) =>
    (t || '')
      .replace(/\s+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([,;:])([^\s])/g, '$1 $2')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#8217;/g, "'")
      .replace(/&#8220;|&#8221;/g, '"')
      .trim();

  const abs = (url) => (!url ? null : url.startsWith('http') ? url : `https://www.nasa.gov${url}`);

  const potong = (arr, max) => (Array.isArray(arr) && arr.length > max ? arr.slice(0, max) : arr);

  const preprocessHTML = (html) =>
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' </p>')
      .replace(/<\/div>/gi, ' </div>')
      .replace(/<\/h[1-6]>/gi, ' </h1>')
      .replace(/<\/li>/gi, ' </li>')
      .replace(/<\/figcaption>/gi, ' </figcaption>');

  function parseHero($, max) {
    const block = $('.wp-block-nasa-blocks-nasa-mag').first();
    if (!block.length) return null;

    const missions = [];
    block.find('.hds-nasa-mag-col').each((i, el) => {
      const label = clean($(el).find('h3.label').first().text());
      const judul = clean($(el).find('a span').first().text());
      const link = abs($(el).find('a').first().attr('href'));
      if (label && judul) missions.push({ label, judul, link });
    });

    return {
      judul: clean(block.find('h2.display-72').first().text()),
      deskripsi: clean(block.find('p.maxw-tablet').first().text()),
      cta: {
        text: clean(block.find('a.usa-button').first().text()),
        link: abs(block.find('a.usa-button').first().attr('href')),
      },
      video: abs(block.find('video source').first().attr('src')),
      missions: potong(missions, max),
    };
  }

  function parseFeaturedNews($, max) {
    const block = $('.wp-block-nasa-blocks-news-manual').first();
    if (!block.length) return null;

    const items = [];

    block.find('a.latest-news-item').each((i, el) => {
      const judul = clean($(el).find('p.heading-22 span').first().text());
      if (!judul) return;
      items.push({
        judul,
        link: abs($(el).attr('href')),
        tipe: clean($(el).find('.label span').first().text()),
        readTime: clean($(el).find('.label.margin-bottom-1').first().text()),
        gambar: abs($(el).find('img').first().attr('src')),
      });
    });

    block.find('a:has(.hds-news-item-bubble)').each((i, el) => {
      const judul = clean($(el).find('p.heading-14').first().text());
      if (!judul) return;
      items.push({
        judul,
        link: abs($(el).attr('href')),
        readTime: clean($(el).find('.label').first().text()),
        tipe: clean($(el).find('.label.color-carbon-60 span').first().text()),
        gambar: abs($(el).find('img').first().attr('src')),
        kecil: true,
      });
    });

    return {
      heading: clean(block.find('h2.section-heading-md').first().text()),
      moreLink: abs(block.find('a.button-primary').first().attr('href')),
      total_tersedia: items.length,
      items: potong(items, max),
    };
  }

  function parseCallout($) {
    const block = $('.wp-block-nasa-blocks-callout').first();
    if (!block.length) return null;

    const ctaTextRaw = clean(block.find('a.button-primary span').first().text());
    const ctaText = ctaTextRaw.replace(/\s*about\s+.+$/i, '').trim();

    return {
      judul: clean(block.find('h2').first().text()),
      deskripsi: clean(block.find('p.p-lg').first().text()),
      cta: {
        text: ctaText,
        link: abs(block.find('a.button-primary').attr('href')),
      },
      gambar: abs(block.find('figure img').attr('src')),
    };
  }

  function parseCardGrids($, max) {
    const grids = [];

    $('.wp-block-nasa-blocks-card-grid').each((i, grid) => {
      const cards = [];

      $(grid).find('a.hds-card-topic').each((j, el) => {
        const judul = clean($(el).find('h3').first().text());
        if (!judul) return;
        cards.push({
          judul,
          link: abs($(el).attr('href')),
          gambar: abs($(el).find('img').first().attr('src')),
          tipe: 'topic',
        });
      });

      $(grid).find('a.hds-card-gallery').each((j, el) => {
        const judul = clean($(el).find('h3').first().text());
        if (!judul) return;

        const gambars = [];
        $(el).find('figure img').each((k, img) => {
          const src = abs($(img).attr('src'));
          if (src) gambars.push(src);
        });

        cards.push({
          judul,
          link: abs($(el).attr('href')),
          jumlah: clean($(el).find('.label div').first().text()),
          gambars,
          tipe: 'gallery',
        });
      });

      const heading = clean($(grid).find('h2.section-heading-sm').first().text());
      if (heading || cards.length) {
        grids.push({
          heading,
          moreText: clean($(grid).find('a.button-primary span').first().text()),
          moreLink: abs($(grid).find('a.button-primary').attr('href')) || null,
          theme: $(grid).hasClass('hds-color-mode-dark') ? 'dark' : 'light',
          total_tersedia: cards.length,
          cards: potong(cards, max),
        });
      }
    });

    return grids;
  }

  function parseImageOfTheDay($) {
    const block = $('.wp-block-nasa-blocks-image-of-the-day').first();
    if (!block.length) return null;

    return {
      label: clean(block.find('h3.label').first().text()),
      judul: clean(block.find('h2.display-41').first().text()),
      subJudul: clean(block.find('p.heading-22').first().text()),
      deskripsi: clean(block.find('p.p-md').first().text()),
      link: abs(block.find('a[href*="image-detail"]').first().attr('href')),
      gambar: abs(block.find('img').first().attr('src')),
      downloadLink: abs(block.find('a.hds-image-download-link').attr('href')),
    };
  }

  function parseSubscription($) {
    const block = $('.wp-block-nasa-blocks-subscription-banner').first();
    if (!block.length) return null;

    return {
      heading: clean(block.find('h2').first().text()),
      subheading: clean(block.find('p.hds-subscription-subheading').first().text()),
      cta: {
        text: clean(block.find('a.button-primary span').first().text()),
        link: abs(block.find('a.button-primary').attr('href')),
      },
      gambar: abs(block.find('figure img').attr('src')),
    };
  }

  function parseStories($, max) {
    const stories = [];

    $('.wp-block-nasa-blocks-story').each((i, block) => {
      const judul = clean($(block).find('h2.display-48').first().text());
      if (!judul) return;

      const ctaTextRaw = clean($(block).find('a.button-primary span').first().text());
      const ctaText = ctaTextRaw.replace(/\s*about\s+.+$/i, '').trim();

      stories.push({
        subtitle: clean($(block).find('h3.subtitle-md').first().text()),
        judul,
        lead: clean($(block).find('p.heading-18').first().text()),
        deskripsi: clean($(block).find('p.p-md').first().text()),
        cta: {
          text: ctaText,
          link: abs($(block).find('a.button-primary').attr('href')),
        },
        gambar: abs($(block).find('figure img').attr('src')),
        caption: clean($(block).find('.hds-caption-text').first().text()),
        credit: clean($(block).find('.hds-credits').first().text()),
      });
    });

    return potong(stories, max);
  }

  async function scrapeHome() {
    const { data } = await fetchWithRetry(API_URL);
    const html = preprocessHTML(data.content.rendered);
    const $ = cheerio.load(html);
    const max = JUMLAH_DIMINTA === Infinity ? Number.MAX_SAFE_INTEGER : JUMLAH_DIMINTA;

    const hasil = {
      meta: {
        page_id: data.id,
        title: clean(data.title.rendered),
        slug: data.slug,
        link: data.link,
        modified: data.modified,
        featured_image: data.featured_image_url,
        author: data.parsely?.meta?.author?.[0]?.name || 'NASA',
        requested_count: JUMLAH_DIMINTA === Infinity ? 'all' : JUMLAH_DIMINTA,
      },
      diambil_pada: new Date().toISOString(),
      hero: parseHero($, max),
      featured_news: parseFeaturedNews($, max),
      callout: parseCallout($),
      card_grids: parseCardGrids($, max),
      image_of_the_day: parseImageOfTheDay($),
      subscription: parseSubscription($),
      stories: parseStories($, max),
    };

    const json = COMPACT ? JSON.stringify(hasil) : JSON.stringify(hasil, null, 2);
    process.stdout.write(json + '\n');
  }

  await scrapeHome().catch((err) => {
    process.stderr.write(
      JSON.stringify({
        error: err.message,
        code: err.code || null,
        status: err.response?.status || null,
      }) + '\n'
    );
    process.exit(1);
  });
}

// ===================================================================
// ========================= COMMAND: blog ===========================
// ===================================================================
async function cmdBlog(args) {
  const angkaArg = args.find((a) => /^\d+$/.test(a));
  const JUMLAH_DIMINTA = angkaArg ? parseInt(angkaArg, 10) : Infinity;
  const COMPACT = args.includes('--compact');
  const OUT_FILE = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1] || null;

  const invalidArg = args.find((a) => !a.startsWith('--') && isNaN(parseInt(a, 10)));
  if (invalidArg) {
    process.stderr.write(JSON.stringify({
      error: `Argumen tidak valid: "${invalidArg}". Contoh: node nasa.js blog 5`,
    }) + '\n');
    process.exit(1);
  }

  if (JUMLAH_DIMINTA !== Infinity && JUMLAH_DIMINTA <= 0) {
    process.stderr.write(JSON.stringify({ error: 'Jumlah harus > 0' }) + '\n');
    process.exit(1);
  }

  const SUMBER = 'https://www.nasa.gov/nasa-blogs/';

  const http = axios.create({
    timeout: 60000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.nasa.gov/',
    },
  });

  async function fetchWithRetry(url, maxRetry = 3) {
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        return await http.get(url);
      } catch (err) {
        if (attempt === maxRetry) throw err;
        process.stderr.write(`[retry ${attempt}/${maxRetry}] ${err.message}\n`);
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }

  const clean = (t) =>
    (t || '')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&#8217;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

  function extractBlogRoot(href) {
    const m = href.match(
      /(https?:\/\/(?:www\.)?(?:blogs|science)\.nasa\.gov\/(?:blogs\/)?[^\/?#]+)/
    );
    if (m) return m[1] + '/';
    return href;
  }

  function parseBlogs(html) {
    const items = [];
    const seen = new Set();

    const rowRegex = /<div[^>]*class="[^"]*featured-link-list-row[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    const headingRegex = /<h2[^>]*class="[^"]*heading-36[^"]*"[^>]*>([\s\S]*?)<\/h2>/i;
    const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>/i;

    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const rowHtml = match[1];

      const hMatch = rowHtml.match(headingRegex);
      if (!hMatch) continue;
      const judul = clean(hMatch[1].replace(/<[^>]+>/g, ''));

      const lMatch = rowHtml.match(linkRegex);
      if (!lMatch) continue;
      let href = lMatch[1];
      if (href.startsWith('/')) href = 'https://www.nasa.gov' + href;

      if (!href.includes('/blogs/') && !href.includes('blogs.nasa.gov')) continue;

      href = extractBlogRoot(href);

      if (seen.has(href)) continue;
      seen.add(href);

      items.push({ judul, link: href });
    }

    if (items.length === 0) {
      const fallbackRegex = /<h2[^>]*class="[^"]*heading-36[^"]*"[^>]*>([\s\S]*?)<\/h2>[\s\S]{0,2000}?<a[^>]*href="([^"]+)"[^>]*>/g;
      let fb;
      while ((fb = fallbackRegex.exec(html)) !== null) {
        const judul = clean(fb[1].replace(/<[^>]+>/g, ''));
        let href = fb[2];
        if (href.startsWith('/')) href = 'https://www.nasa.gov' + href;
        if (!href.includes('/blogs/') && !href.includes('blogs.nasa.gov')) continue;
        href = extractBlogRoot(href);
        if (seen.has(href)) continue;
        seen.add(href);
        items.push({ judul, link: href });
      }
    }

    return items;
  }

  async function scrapeBlogs() {
    process.stderr.write(`🌐 Fetch: ${SUMBER}\n`);

    const { data: html } = await fetchWithRetry(SUMBER);

    if (typeof html !== 'string' || html.length < 100) {
      throw new Error('Response bukan HTML valid');
    }

    let blogs = parseBlogs(html);

    if (blogs.length === 0) {
      throw new Error('0 blog ke-parse. Cek struktur HTML atau selector.');
    }

    const total = blogs.length;
    if (JUMLAH_DIMINTA !== Infinity) {
      blogs = blogs.slice(0, JUMLAH_DIMINTA);
    }

    const hasil = {
      meta: {
        sumber: SUMBER,
        diambil_pada: new Date().toISOString(),
        total_tersedia: total,
        total_diambil: blogs.length,
      },
      blogs,
    };

    const json = COMPACT ? JSON.stringify(hasil) : JSON.stringify(hasil, null, 2);

    if (OUT_FILE) {
      const outPath = path.resolve(process.cwd(), OUT_FILE);
      fs.writeFileSync(outPath, json + '\n', 'utf8');
      process.stderr.write(`✅ Tersimpan: ${outPath} (${blogs.length} blog)\n`);
      return;
    }

    process.stdout.write(json + '\n');
  }

  await scrapeBlogs().catch((err) => {
    process.stderr.write(
      JSON.stringify({
        error: err.message,
        code: err.code || null,
        status: err.response?.status || null,
        hint: `Cek manual: ${SUMBER}`,
      }) + '\n'
    );
    process.exit(1);
  });
}

// ===================================================================
// ========================= COMMAND: news ===========================
// (versi terbaru dari 2 scraper berita yang ada — recentlypublish.js)
// ===================================================================
async function cmdNews(args) {
  const angkaArg = args.find((a) => /^\d+$/.test(a));
  const JUMLAH_HALAMAN = angkaArg ? parseInt(angkaArg, 10) : 1;
  const COMPACT = args.includes('--compact');
  const OUT_FILE = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1] || null;

  const invalidArg = args.find((a) => !a.startsWith('--') && isNaN(parseInt(a, 10)));
  if (invalidArg) {
    process.stderr.write(JSON.stringify({
      error: `Argumen tidak valid: "${invalidArg}". Contoh: node nasa.js news 5`,
    }) + '\n');
    process.exit(1);
  }

  if (JUMLAH_HALAMAN <= 0) {
    process.stderr.write(JSON.stringify({ error: 'Jumlah halaman harus > 0' }) + '\n');
    process.exit(1);
  }

  const SUMBER = 'https://www.nasa.gov/news/recently-published/';
  const BASE = 'https://www.nasa.gov/wp-json/wp/v2/posts';
  const API = `${BASE}?per_page=100&_embed=1&orderby=date&order=desc`;

  const http = axios.create({
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': SUMBER,
      'Origin': 'https://www.nasa.gov',
    },
  });

  async function fetchWithRetry(url, maxRetry = 3) {
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        return await http.get(url);
      } catch (err) {
        if (attempt === maxRetry) throw err;
        process.stderr.write(`[retry ${attempt}/${maxRetry}] ${err.message}\n`);
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }

  const ENTITY_MAP = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#8217;': "'", '&#8216;': "'", '&#8220;': '"', '&#8221;': '"',
    '&#8211;': '–', '&#8212;': '—', '&hellip;': '...',
  };

  const clean = (t) =>
    (t || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z#0-9]+;/gi, (m) => ENTITY_MAP[m] ?? m)
      .replace(/\s+/g, ' ')
      .replace(/\[…\]/g, '...')
      .trim();

  function parsePost(post) {
    const media = post._embedded?.['wp:featuredmedia']?.[0];
    const terms = post._embedded?.['wp:term']?.[0] || [];
    const author = post._embedded?.author?.[0]?.name || 'NASA';

    const kategori = terms
      .map((t) => t.name)
      .filter((n) => n && n !== 'Uncategorized')
      .join(', ') || 'News Release';

    return {
      id: post.id,
      judul: clean(post.title?.rendered || ''),
      slug: post.slug,
      link: post.link,
      tanggal: post.date,
      tanggal_gmt: post.date_gmt,
      modified: post.modified,
      readTime: post.read_time ? `${post.read_time} min read` : null,
      kategori,
      author,
      deskripsi: clean(post.excerpt?.rendered || ''),
      gambar: media?.source_url || null,
      gambar_alt: media?.alt_text || '',
      gambar_caption: clean(media?.caption?.rendered || ''),
    };
  }

  async function scrapeNews() {
    const cek = await fetchWithRetry(`${API}&page=1`);
    const totalPages = parseInt(cek.headers['x-wp-totalpages'] || '1', 10);
    const totalPost = parseInt(cek.headers['x-wp-total'] || '0', 10);

    const maxPage = Math.min(JUMLAH_HALAMAN, totalPages);

    process.stderr.write(`📚 Total: ${totalPost} post | ${totalPages} halaman\n`);
    process.stderr.write(`🎯 Ambil ${maxPage} halaman pertama...\n`);

    let allPosts = [];
    for (let page = 1; page <= maxPage; page++) {
      const res = await fetchWithRetry(`${API}&page=${page}`);
      const posts = res.data;
      if (!posts.length) break;
      process.stderr.write(`📄 Page ${page}/${maxPage} → ${posts.length} posts\n`);
      allPosts = allPosts.concat(posts);
      if (page < maxPage) await new Promise((r) => setTimeout(r, 300));
    }

    const berita = allPosts.map(parsePost);

    const hasil = {
      meta: {
        sumber: SUMBER,
        api: API,
        halaman_diminta: JUMLAH_HALAMAN,
        halaman_diambil: maxPage,
        total_halaman_tersedia: totalPages,
        total_post_tersedia: totalPost,
        total_diambil: berita.length,
      },
      diambil_pada: new Date().toISOString(),
      berita,
    };

    const json = COMPACT ? JSON.stringify(hasil) : JSON.stringify(hasil, null, 2);

    if (OUT_FILE) {
      const outPath = path.resolve(process.cwd(), OUT_FILE);
      fs.writeFileSync(outPath, json + '\n', 'utf8');
      process.stderr.write(`✅ Tersimpan ke: ${outPath}\n`);
      return;
    }

    process.stdout.write(json + '\n');
  }

  await scrapeNews().catch((err) => {
    process.stderr.write(JSON.stringify({
      error: err.message,
      code: err.code || null,
      status: err.response?.status || null,
      hint: `Cek manual: ${API}&page=1`,
    }) + '\n');
    process.exit(1);
  });
}

// ===================================================================
// ======================== COMMAND: podcast ==========================
// ===================================================================
async function cmdPodcast(args) {
  const INDEX_URL = 'https://www.nasa.gov/podcasts-and-audio/';
  const BASE = 'https://www.nasa.gov';

  const COMPACT = args.includes('--compact');
  const OUT_FILE = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1] || null;
  const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
  const LIST_ONLY = args.includes('--list');

  const http = axios.create({
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const clean = (t) =>
    (t || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#039;|&#8217;/g, "'")
      .replace(/&#8220;|&#8221;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/&hellip;/g, '...')
      .replace(/\s+/g, ' ')
      .trim();

  async function discoverSources() {
    const { data: html } = await http.get(INDEX_URL);

    const links = new Map();
    const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;

    const skipPatterns = [
      '/podcasts/houston-we-have-a-podcast/',
      '/podcasts/curious-universe/',
      '/podcasts/small-steps-giant-leaps/',
      '/podcasts/universo-curioso-de-la-nasa/',
      '/podcasts/houston-we-have-a-podcast/',
      'soundcloud.com',
      'youtube.com',
      'twitter.com',
      'facebook.com',
      'instagram.com',
    ];

    while ((m = linkRegex.exec(html)) !== null) {
      let href = m[1];
      if (href.startsWith('/')) href = BASE + href;
      if (!href.includes('nasa.gov')) continue;
      if (skipPatterns.some((s) => href.includes(s))) continue;

      const isAudioPage =
        /\/podcasts\/?$/i.test(href) ||
        /\/artemisaudio\/?$/i.test(href) ||
        /\/historical-sounds\/?$/i.test(href) ||
        /\/data-sonifications\/?$/i.test(href) ||
        /\/sounds-from-beyond\/?$/i.test(href);

      if (!isAudioPage) continue;
      if (links.has(href)) continue;

      const judul = clean(m[2]);
      links.set(href, judul || href.split('/').filter(Boolean).pop());
    }

    if (links.size === 0) {
      console.error('[info] Discovery gagal, pakai fallback list');
      return [
        { id: 'artemis', nama: 'Artemis Audio', url: 'https://www.nasa.gov/artemisaudio/', pattern: 'hds-file-list' },
        { id: 'history', nama: 'Historical Sounds', url: 'https://www.nasa.gov/historical-sounds/', pattern: 'audio-tag' },
        { id: 'sonify', nama: 'Data Sonifications', url: 'https://www.nasa.gov/data-sonifications/', pattern: 'audio-tag' },
        { id: 'beyond', nama: 'Sounds from Beyond', url: 'https://www.nasa.gov/sounds-from-beyond/', pattern: 'audio-tag' },
      ];
    }

    return [...links.entries()].map(([url, nama]) => {
      let pattern = 'auto';
      if (url.includes('artemisaudio')) pattern = 'hds-file-list';
      else if (url.includes('historical-sounds')) pattern = 'audio-tag';
      else if (url.includes('data-sonifications')) pattern = 'audio-tag';
      else if (url.includes('sounds-from-beyond')) pattern = 'audio-tag';

      const slug = url.split('/').filter(Boolean).pop() || 'unknown';

      return {
        id: slug,
        nama: nama || slug,
        url,
        pattern,
      };
    });
  }

  function parseHdsFileList(html) {
    const groups = [];
    const seen = new Set();
    const parts = html.split(/<h3[^>]*class="[^"]*wp-block-heading[^"]*"[^>]*>/i);

    for (let i = 1; i < parts.length; i++) {
      const section = parts[i];
      const katMatch = section.match(/^([\s\S]*?)<\/h3>/i);
      const kategori = katMatch ? clean(katMatch[1]) : `Section ${i}`;

      const skipKeywords = ['How These Sounds', 'Frequently Asked', 'Who is this audio', 'Do I need permission', 'Can I use', 'Will more audio'];
      if (skipKeywords.some((k) => kategori.includes(k))) continue;

      const group = { kategori, audio: [] };
      const rowRegex = /<div[^>]*class="[^"]*hds-file-list-row[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*hds-file-list-row|<\/div>\s*<\/div>\s*<\/div>\s*(?:<h[23]|$))/g;
      let rowMatch;

      while ((rowMatch = rowRegex.exec(section)) !== null) {
        const rowHtml = rowMatch[1];
        const titleMatch = rowHtml.match(/<h2[^>]*class="[^"]*heading-22[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
        if (!titleMatch) continue;
        const judul = clean(titleMatch[1]);
        if (!judul) continue;

        const linkMatch = rowHtml.match(/<a[^>]*href="([^"]+\.(?:mp3|wav|m4r))"[^>]*>/i);
        if (!linkMatch) continue;
        let link = linkMatch[1];
        if (link.startsWith('/')) link = BASE + link;
        if (seen.has(link)) continue;
        seen.add(link);

        const dateMatch = rowHtml.match(/<p[^>]*class="[^"]*p-sm[^"]*"[^>]*>((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^<]*)<\/p>/i);
        const sizeMatch = rowHtml.match(/<p[^>]*class="[^"]*p-sm[^"]*"[^>]*>((?:MPEG|WAV|MP3|M4R)[^<]*)<\/p>/i);

        const obj = {
          judul,
          format: link.split('.').pop().toLowerCase(),
          link,
        };
        if (dateMatch) obj.tanggal = clean(dateMatch[1]);
        if (sizeMatch) obj.ukuran = clean(sizeMatch[1]);

        group.audio.push(obj);
      }

      if (group.audio.length > 0) groups.push(group);
    }

    return groups;
  }

  function parseAudioTags(html) {
    const groups = [];
    const seen = new Set();
    const parts = html.split(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/i);

    let currentGroup = { kategori: 'General', audio: [] };

    for (let i = 1; i < parts.length; i += 3) {
      const heading = clean(parts[i + 1]);
      const section = parts[i + 2] || '';

      if (heading && heading.length < 200) {
        const skipKeywords = ['Frequently', 'How These', 'Who is this', 'Do I need', 'Can I use'];
        if (!skipKeywords.some((k) => heading.includes(k))) {
          if (currentGroup.audio.length > 0) groups.push(currentGroup);
          currentGroup = { kategori: heading, audio: [] };
        }
      }

      const audioRegex = /<audio[^>]*>([\s\S]*?)<\/audio>/gi;
      let am;
      while ((am = audioRegex.exec(section)) !== null) {
        const audioHtml = am[0];
        const srcMatch = audioHtml.match(/<source[^>]*src="([^"]+\.(?:mp3|wav|m4r|ogg))"/i) || audioHtml.match(/src="([^"]+\.(?:mp3|wav|m4r|ogg))"/i);
        if (!srcMatch) continue;

        let link = srcMatch[1];
        if (link.startsWith('/')) link = BASE + link;
        if (seen.has(link)) continue;
        seen.add(link);

        const before = section.slice(0, am.index);
        const hMatch = [...before.matchAll(/<h[3-5][^>]*>([\s\S]*?)<\/h[3-5]>/gi)];
        let judul = hMatch.length ? clean(hMatch[hMatch.length - 1][1]) : null;

        if (!judul) {
          judul = decodeURIComponent(link.split('/').pop().replace(/\.\w+$/, ''))
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
        }

        currentGroup.audio.push({
          judul,
          format: link.split('.').pop().toLowerCase(),
          link,
        });
      }
    }

    if (currentGroup.audio.length > 0) groups.push(currentGroup);
    return groups;
  }

  function parseDirectMp3Links(html) {
    const groups = [];
    const seen = new Set();
    const parts = html.split(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/i);

    let currentGroup = { kategori: 'General', audio: [] };

    for (let i = 1; i < parts.length; i += 3) {
      const heading = clean(parts[i + 1]);
      const section = parts[i + 2] || '';

      if (heading && heading.length < 200) {
        const skipKeywords = ['Frequently', 'How These', 'Who is this', 'Do I need', 'Can I use'];
        if (!skipKeywords.some((k) => heading.includes(k))) {
          if (currentGroup.audio.length > 0) groups.push(currentGroup);
          currentGroup = { kategori: heading, audio: [] };
        }
      }

      const mp3Regex = /<a[^>]*href="([^"]+\.(?:mp3|wav|m4r))"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = mp3Regex.exec(section)) !== null) {
        let link = m[1];
        if (link.startsWith('/')) link = BASE + link;
        if (seen.has(link)) continue;
        seen.add(link);

        const anchorText = clean(m[2]);
        const fallbackName = decodeURIComponent(link.split('/').pop().replace(/\.\w+$/, ''))
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        currentGroup.audio.push({
          judul: anchorText || fallbackName,
          format: link.split('.').pop().toLowerCase(),
          link,
        });
      }
    }

    if (currentGroup.audio.length > 0) groups.push(currentGroup);
    return groups;
  }

  function parseGroupedAudio(html, preferPattern = null) {
    if (preferPattern === 'hds-file-list') {
      const g = parseHdsFileList(html);
      if (g.length > 0) return g;
    }
    if (preferPattern === 'audio-tag') {
      const g = parseAudioTags(html);
      if (g.length > 0) return g;
    }

    const hds = parseHdsFileList(html);
    if (hds.length > 0) return hds;

    const audioTag = parseAudioTags(html);
    if (audioTag.length > 0) return audioTag;

    return parseDirectMp3Links(html);
  }

  async function scrapeOne(source) {
    try {
      const { data: html } = await http.get(source.url);
      const groups = parseGroupedAudio(html, source.pattern);
      const totalAudio = groups.reduce((sum, g) => sum + g.audio.length, 0);
      return {
        id: source.id,
        nama: source.nama,
        url: source.url,
        kategori_count: groups.length,
        total_audio: totalAudio,
        kategori: groups,
      };
    } catch (err) {
      return {
        id: source.id,
        nama: source.nama,
        url: source.url,
        error: err.message,
      };
    }
  }

  try {
    const allSources = await discoverSources();

    const sources = ONLY
      ? allSources.filter((s) => s.id === ONLY.toLowerCase() || s.nama.toLowerCase().includes(ONLY.toLowerCase()))
      : allSources;

    if (sources.length === 0) {
      process.stdout.write(JSON.stringify({
        error: `Source "${ONLY}" tidak ditemukan.`,
        available: allSources.map((s) => s.id),
      }, null, 2) + '\n');
      process.exit(1);
    }

    if (LIST_ONLY) {
      process.stdout.write(JSON.stringify({
        index_url: INDEX_URL,
        total: allSources.length,
        sumber: allSources.map((s) => ({ id: s.id, nama: s.nama, url: s.url, pattern: s.pattern })),
      }, null, 2) + '\n');
      return;
    }

    const hasil = {
      meta: {
        index_url: INDEX_URL,
        diambil_pada: new Date().toISOString(),
        total_sumber: sources.length,
      },
      sumber: [],
    };

    let grandTotal = 0;
    for (const source of sources) {
      const result = await scrapeOne(source);
      hasil.sumber.push(result);
      if (result.total_audio) grandTotal += result.total_audio;
      await new Promise((r) => setTimeout(r, 300));
    }

    hasil.meta.total_audio = grandTotal;

    const json = COMPACT ? JSON.stringify(hasil) : JSON.stringify(hasil, null, 2);

    if (OUT_FILE) {
      fs.writeFileSync(path.resolve(process.cwd(), OUT_FILE), json + '\n', 'utf8');
      return;
    }

    process.stdout.write(json + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }, null, 2) + '\n');
    process.exit(1);
  }
}

// ===================================================================
// ========================= COMMAND: series ==========================
// ===================================================================
async function cmdSeries(args) {
  const INDEX_URL = 'https://plus.nasa.gov/series/';
  const BASE = 'https://plus.nasa.gov';

  const COMPACT = args.includes('--compact');
  const OUT_FILE = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1] || null;
  const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
  const LIST_ONLY = args.includes('--list');
  const NO_EPISODES = args.includes('--no-episodes');

  const http = axios.create({
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const clean = (t) =>
    (t || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#039;|&#8217;/g, "'")
      .replace(/&#8220;|&#8221;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/&hellip;/g, '...')
      .replace(/\s+/g, ' ')
      .trim();

  async function discoverSeries() {
    const { data: html } = await http.get(INDEX_URL);

    const series = new Map();

    const linkRegex = /<a[^>]*href="(https:\/\/plus\.nasa\.gov\/series\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;

    while ((m = linkRegex.exec(html)) !== null) {
      const url = m[1];
      if (url === INDEX_URL || url === BASE + '/series/') continue;
      if (series.has(url)) continue;

      const slug = url.split('/').filter(Boolean).pop();
      const text = clean(m[2]).replace(/\d+\s*Episodes?/i, '').trim();

      series.set(url, {
        slug,
        nama: text || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        url,
      });
    }

    if (series.size === 0) {
      const fallbackRegex = /href="(\/series\/[^"\/]+\/)"/gi;
      while ((m = fallbackRegex.exec(html)) !== null) {
        const path_ = m[1];
        if (path_ === '/series/') continue;
        const url = BASE + path_;
        if (series.has(url)) continue;
        const slug = path_.split('/').filter(Boolean).pop();
        series.set(url, {
          slug,
          nama: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          url,
        });
      }
    }

    return [...series.values()];
  }

  function parseEpisodes(html) {
    const episodes = [];
    const seen = new Set();

    const articleRegex = /<article[^>]*class="[^"]*video-(?:list|grid)[^"]*"[^>]*>([\s\S]*?)(?=<article[^>]*class="[^"]*video-|<\/div>\s*<\/section>|$)/g;
    let am;

    while ((am = articleRegex.exec(html)) !== null) {
      const block = am[1];

      const linkMatch = block.match(/<a[^>]*href="(https:\/\/plus\.nasa\.gov\/video\/[^"]+)"[^>]*>/i);
      if (!linkMatch) continue;
      const link = linkMatch[1];
      if (seen.has(link)) continue;
      seen.add(link);

      const titleMatch = block.match(/<h4[^>]*class="[^"]*video-(?:list|grid)--title[^"]*"[^>]*>([\s\S]*?)<\/h4>/i);
      const judul = titleMatch ? clean(titleMatch[1]) : null;

      const runtimeMatch = block.match(/(\d{2}:\d{2}:\d{2})/);
      const runtime = runtimeMatch ? runtimeMatch[1] : null;

      const dateMatch = block.match(/<time[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/i);
      const tanggal = dateMatch ? dateMatch[2].trim() : null;
      const tanggal_iso = dateMatch ? dateMatch[1] : null;

      const descMatch = block.match(/<div[^>]*id="excerpt-\d+"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
      const deskripsi = descMatch ? clean(descMatch[1]).replace(/\[…\]/g, '...') : null;

      const thumbMatch = block.match(/background-image:\s*url\(\s*([^)]+?)\s*\)/i);
      const gambar = thumbMatch ? thumbMatch[1].replace(/&amp;/g, '&').trim() : null;

      const tags = [...block.matchAll(/<a[^>]*class="primary-term-link"[^>]*href="[^"]+"[^>]*>([^<]+)<\/a>/gi)]
        .map((t) => clean(t[1]))
        .filter(Boolean);

      episodes.push({
        judul,
        link,
        runtime,
        tanggal,
        tanggal_iso,
        deskripsi,
        gambar,
        tags: tags.length ? tags : null,
      });
    }

    if (episodes.length === 0) {
      const linkRegex = /<a[^>]*href="(https:\/\/plus\.nasa\.gov\/video\/[^"]+)"[^>]*>\s*<h4[^>]*>([\s\S]*?)<\/h4>/gi;
      let lm;
      while ((lm = linkRegex.exec(html)) !== null) {
        const link = lm[1];
        if (seen.has(link)) continue;
        seen.add(link);
        episodes.push({
          judul: clean(lm[2]),
          link,
          runtime: null,
          tanggal: null,
          deskripsi: null,
          gambar: null,
          tags: null,
        });
      }
    }

    return episodes;
  }

  async function scrapeSeries(series) {
    try {
      const { data: html } = await http.get(series.url);

      const bannerMatch = html.match(/<figure[^>]*class="[^"]*banner[^"]*"[^>]*style="background-image:url\(([^)]+)\)/i);
      const banner = bannerMatch ? bannerMatch[1].replace(/&amp;/g, '&').trim() : null;

      const descMatch = html.match(/<meta name="description" content="([^"]+)"/i);
      const deskripsi = descMatch ? clean(descMatch[1]) : null;

      const episodes = NO_EPISODES ? [] : parseEpisodes(html);

      return {
        slug: series.slug,
        nama: series.nama,
        url: series.url,
        deskripsi,
        banner,
        episode_count: episodes.length,
        episodes,
      };
    } catch (err) {
      return {
        slug: series.slug,
        nama: series.nama,
        url: series.url,
        error: err.message,
      };
    }
  }

  try {
    const allSeries = await discoverSeries();

    if (allSeries.length === 0) {
      process.stdout.write(JSON.stringify({ error: 'Tidak ada series ke-discover' }, null, 2) + '\n');
      process.exit(1);
    }

    const filtered = ONLY
      ? allSeries.filter((s) => s.slug === ONLY.toLowerCase() || s.nama.toLowerCase().includes(ONLY.toLowerCase()))
      : allSeries;

    if (filtered.length === 0) {
      process.stdout.write(JSON.stringify({
        error: `Series "${ONLY}" tidak ditemukan.`,
        available: allSeries.map((s) => s.slug),
      }, null, 2) + '\n');
      process.exit(1);
    }

    if (LIST_ONLY) {
      process.stdout.write(JSON.stringify({
        meta: {
          index_url: INDEX_URL,
          total: allSeries.length,
        },
        series: allSeries.map((s) => ({ slug: s.slug, nama: s.nama, url: s.url })),
      }, null, 2) + '\n');
      return;
    }

    const hasil = {
      meta: {
        index_url: INDEX_URL,
        diambil_pada: new Date().toISOString(),
        total_series: filtered.length,
      },
      series: [],
    };

    let totalEpisodes = 0;

    for (const s of filtered) {
      const result = await scrapeSeries(s);
      hasil.series.push(result);
      if (result.episode_count) totalEpisodes += result.episode_count;
      await new Promise((r) => setTimeout(r, 300));
    }

    hasil.meta.total_episodes = totalEpisodes;

    const json = COMPACT ? JSON.stringify(hasil) : JSON.stringify(hasil, null, 2);

    if (OUT_FILE) {
      fs.writeFileSync(path.resolve(process.cwd(), OUT_FILE), json + '\n', 'utf8');
      return;
    }

    process.stdout.write(json + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }, null, 2) + '\n');
    process.exit(1);
  }
}

// ===================================================================
// =============================  MAIN  ===============================
// ===================================================================
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help' || cmd === 'menu') {
    process.stdout.write(MENU + '\n');
    return;
  }

  switch (cmd) {
    case 'home':
      return cmdHome(rest);
    case 'blog':
      return cmdBlog(rest);
    case 'news':
      return cmdNews(rest);
    case 'podcast':
      return cmdPodcast(rest);
    case 'series':
      return cmdSeries(rest);
    default:
      process.stderr.write(`❌ Command tidak dikenal: "${cmd}"\n`);
      process.stdout.write(MENU + '\n');
      process.exit(1);
  }
}

main();
