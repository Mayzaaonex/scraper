const https = require('node:https');

const RSS_URL = 'https://feeds.bbci.co.uk/news/rss.xml';
const XML_ESCAPES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[\da-fA-F]+|#\d+|\w+);/g, (_, key) => {
      if (key[0] === '#') return String.fromCodePoint(key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : +key.slice(1));
      return XML_ESCAPES[key] ?? `&${key};`;
    }).trim();
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return decodeXml(match?.[1] ?? '');
}

function attr(xml, tagName, attribute) {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, 'i'));
  return decodeXml(match?.[1] ?? '');
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (RSS reader)' } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => body += chunk);
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 300
        ? resolve(body) : reject(new Error(`HTTP ${response.statusCode}`)));
    }).on('error', reject);
  });
}

function parse(xml, limit = 10) {
  const channel = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i)?.[1] ?? '';
  const items = [...channel.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, item]) => ({
    id: tag(item, 'guid'),
    title: tag(item, 'title'),
    url: tag(item, 'link'),
    publishedAt: tag(item, 'pubDate'),
    imageUrl: attr(item, 'media:thumbnail', 'url'),
    summary: tag(item, 'description')
  }));
  return items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, limit);
}

(async () => {
  try {
    const n = Number.parseInt(process.argv[2], 10);
    const limit = Number.isFinite(n) && n > 0 ? n : 10;
    console.log(JSON.stringify(parse(await get(RSS_URL), limit), null, 2));
  } catch (error) {
    console.error(`Gagal mengambil BBC News: ${error.message}`);
    process.exitCode = 1;
  }
})();
