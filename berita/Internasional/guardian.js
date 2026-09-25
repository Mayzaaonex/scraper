const https = require('node:https');

const RSS_URL = 'https://www.theguardian.com/world/rss';

function decode(v = '') {
  return v.replace(/&(#x[\da-fA-F]+|#\d+|\w+);/g, (_, k) => {
    if (k[0] === '#') return String.fromCodePoint(k[1].toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : +k.slice(1));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[k] ?? `&${k};`;
  }).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return decode(m?.[1] ?? '');
}

function attr(xml, tagName, attribute) {
  const m = xml.match(new RegExp(`<${tagName}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, 'i'));
  const v = m?.[1] ?? '';
  return decode(v);
}

function largestImage(item) {
  const urls = [...item.matchAll(/<media:content\b[^>]*\burl=["']([^"']+)["']/gi)].map(m => decode(m[1]));
  for (const u of urls) if (u.includes('width=700') || u.includes('width=1000')) return u;
  for (const u of urls) if (u.includes('width=460')) return u;
  return urls[0] ?? '';
}

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (RSS reader)' } }, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c);
      r.on('end', () => r.statusCode >= 200 && r.statusCode < 300 ? res(b) : rej(new Error('HTTP ' + r.statusCode)));
    }).on('error', rej);
  });
}

(async () => {
  try {
    const n = parseInt(process.argv[2], 10);
    const limit = Number.isFinite(n) && n > 0 ? n : 10;
    const xml = await get(RSS_URL);
    const ch = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i)?.[1] ?? '';
    const items = [...ch.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, it]) => ({
      id: tag(it, 'guid'), title: tag(it, 'title'), url: tag(it, 'link'),
      publishedAt: tag(it, 'pubDate'), imageUrl: largestImage(it), summary: tag(it, 'description')
    })).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, limit);
    console.log(JSON.stringify(items, null, 2));
  } catch (e) { console.error('Guardian fail: ' + e.message); process.exitCode = 1; }
})();
