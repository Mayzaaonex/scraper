const https = require('node:https');

const URL = 'https://indeks.kompas.com/';

function decode(value = '') {
  return value.replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-fA-F]+|#\d+|\w+);/g, (_, key) => {
      if (key[0] === '#') return String.fromCodePoint(key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : +key.slice(1));
      return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key] ?? `&${key};`;
    }).replace(/\s+/g, ' ').trim();
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (news reader)' } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => res.statusCode >= 200 && res.statusCode < 300
        ? resolve(body) : reject(new Error(`HTTP ${res.statusCode}`)));
    }).on('error', reject);
  });
}

function attr(html, name) {
  const match = html.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'));
  return decode(match?.[1] ?? '');
}

function text(html, className) {
  const match = html.match(new RegExp(`<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'i'));
  return decode(match?.[1] ?? '');
}

function parse(html, limit = 10) {
  return [...html.matchAll(/<a\s+class=["']article-link["'][^>]*>[\s\S]*?<\/a>/gi)]
    .map(([block]) => ({
      title: text(block, 'articleTitle'),
      url: attr(block, 'href'),
      imageUrl: attr((block.match(/<img\b[^>]*>/i) ?? [''])[0], 'src'),
      category: text(block, 'articlePost-subtitle'),
      publishedAt: text(block, 'articlePost-date')
    }))
    .filter(item => item.title && item.url)
    .slice(0, limit);
}

(async () => {
  try {
    const n = Number.parseInt(process.argv[2], 10);
    const limit = Number.isFinite(n) && n > 0 ? n : 10;
    console.log(JSON.stringify(parse(await get(URL), limit), null, 2));
  } catch (error) {
    console.error(`Gagal mengambil Kompas: ${error.message}`);
    process.exitCode = 1;
  }
})();
