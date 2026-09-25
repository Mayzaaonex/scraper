// p.js - SSSTik.io Scraper + Uguu.se Uploader
// Usage: node p.js "https://vt.tiktok.com/ZSqECbYqS/"
// Output: pure JSON only
// Node.js >= 18

const BASE_URL = "https://ssstik.io";
const UGUU_URL = "https://uguu.se/upload.php";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const UA_UPLOAD =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";
const CREDIT = { creator: "Mayzaa" };

// ============ Cookie jar ============
let cookieJar = {};

function parseCookies(res) {
  const raw = res.headers.get("set-cookie");
  if (!raw) return;
  const parts = raw.split(/,(?=[^;]+=)/);
  for (const part of parts) {
    const [pair] = part.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (name && value) cookieJar[name] = value;
    }
  }
}

function cookieHeader() {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ============ STEP 1: Ambil token tt ============
async function getToken() {
  const res = await fetch(`${BASE_URL}/en`, {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": UA,
      referer: "https://ssstik.io/",
    },
  });

  parseCookies(res);
  const html = await res.text();

  const patterns = [
    /name=["']tt["']\s+value=["']([^"']+)["']/i,
    /value=["']([^"']+)["']\s+name=["']tt["']/i,
    /["']tt["']\s*:\s*["']([^"']+)["']/i,
    /tt\s*=\s*["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1] && m[1].length < 100) return m[1];
  }

  const inputs = html.match(/<input[^>]+>/gi) || [];
  for (const inp of inputs) {
    const nameMatch = inp.match(/name=["']([^"']+)["']/i);
    const valMatch = inp.match(/value=["']([^"']+)["']/i);
    if (nameMatch && valMatch && /tt/i.test(nameMatch[1])) return valMatch[1];
  }

  throw new Error("Token tt tidak ditemukan");
}

// ============ STEP 2: POST /abc?url=dl ============
async function submitUrl(tiktokUrl, token) {
  const body = new URLSearchParams({
    id: tiktokUrl,
    locale: "en",
    tt: token,
    debug: "ab=1&loc=ID&ip=0.0.0.0",
  });

  const res = await fetch(`${BASE_URL}/abc?url=dl`, {
    method: "POST",
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      "hx-current-url": "https://ssstik.io/",
      "hx-request": "true",
      "hx-target": "target",
      "hx-trigger": "_gcaptcha_pt",
      origin: "https://ssstik.io",
      referer: "https://ssstik.io/",
      "user-agent": UA,
      cookie: cookieHeader(),
    },
    body: body.toString(),
  });

  parseCookies(res);
  if (!res.ok) throw new Error(`POST gagal: HTTP ${res.status}`);

  const html = await res.text();
  if (!html || html.length < 100) {
    throw new Error(`Response kosong (${html.length} bytes)`);
  }

  return html;
}

// ============ STEP 3: Parse HTML ============
function parseResult(html) {
  const result = {
    author: null,
    avatar: null,
    thumbnail: null,
    video: null,
    audio: null,
    stats: { likes: null, comments: null, shares: null },
  };

  const authorMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  if (authorMatch) result.author = authorMatch[1].trim();

  const avatarMatch = html.match(/class="result_author"\s+src="([^"]+)"/);
  if (avatarMatch) result.avatar = avatarMatch[1];

  const thumbMatch = html.match(/background-image:\s*url\(([^)]+)\)/);
  if (thumbMatch) result.thumbnail = thumbMatch[1];

  const sdPatterns = [
    /<a\s+[^>]*class="[^"]*without_watermark(?!_hd)[^"]*"[^>]*href="(https:\/\/[^"]+)"/i,
    /<a\s+href="(https:\/\/[^"]+)"[^>]*class="[^"]*without_watermark(?!_hd)[^"]*"/i,
    /href="(https:\/\/tikcdn\.io\/ssstik\/\d+\?st=[^"]+)"/i,
    /href="(https:\/\/tikcdn\.io\/ssstik\/\d+[^"]*)"/i,
  ];
  for (const p of sdPatterns) {
    const m = html.match(p);
    if (m) {
      result.video = m[1].replace(/&amp;/g, "&");
      break;
    }
  }

  const audioPatterns = [
    /<a\s+href="(https:\/\/[^"]+)"[^>]*class="[^"]*download_link\s+music[^"]*"/i,
    /<a\s+[^>]*class="[^"]*download_link\s+music[^"]*"[^>]*href="(https:\/\/[^"]+)"/i,
    /href="(https:\/\/tikcdn\.io\/ssstik\/m\/[^"]+)"/i,
  ];
  for (const p of audioPatterns) {
    const m = html.match(p);
    if (m) {
      result.audio = m[1].replace(/&amp;/g, "&");
      break;
    }
  }

  const statsMatches = [...html.matchAll(/<div>([\d.]+[KM]?)<\/div>/g)];
  if (statsMatches[0]) result.stats.likes = statsMatches[0][1];
  if (statsMatches[1]) result.stats.comments = statsMatches[1][1];
  if (statsMatches[2]) result.stats.shares = statsMatches[2][1];

  return result;
}

// ============ STEP 4: Download ke Buffer ============
async function fetchBuffer(url, referer = "https://ssstik.io/") {
  const res = await fetch(url, {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      referer,
      "user-agent": UA,
      cookie: cookieHeader(),
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`Fetch HTTP ${res.status}`);

  const ct = res.headers.get("content-type") || "";
  if (
    !ct.includes("video") &&
    !ct.includes("audio") &&
    !ct.includes("image") &&
    !ct.includes("octet-stream")
  ) {
    throw new Error(`Bukan binary (CT: ${ct})`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ============ STEP 5: Upload ke Uguu ============
async function uploadToUguu(buffer, filename) {
  const form = new FormData();
  form.append("files[]", new Blob([buffer]), filename);

  const res = await fetch(UGUU_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA_UPLOAD,
      Origin: "https://uguu.se",
      Referer: "https://uguu.se/",
      Accept: "*/*",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    body: form,
  });

  if (!res.ok) throw new Error(`Uguu HTTP ${res.status}`);

  const data = await res.json();
  const url = data?.files?.[0]?.url || null;
  if (!url) throw new Error("Uguu: no URL");

  return url;
}

// ============ PIPELINE ============
async function processOne(url, filename) {
  const buf = await fetchBuffer(url);
  const uploaded = await uploadToUguu(buf, filename);
  return { url: uploaded, size: buf.length };
}

// ============ MAIN ============
(async () => {
  const tiktokUrl = process.argv[2];

  if (!tiktokUrl) {
    console.log(
      JSON.stringify(
        {
          ...CREDIT,
          status: false,
          message: "Usage: node p.js <tiktok-url>",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  if (!/tiktok\.com/.test(tiktokUrl)) {
    console.log(
      JSON.stringify(
        { ...CREDIT, status: false, message: "Bukan URL TikTok" },
        null,
        2
      )
    );
    process.exit(1);
  }

  try {
    const token = await getToken();
    const html = await submitUrl(tiktokUrl, token);
    const parsed = parseResult(html);

    const safeAuthor = (parsed.author || "unknown").replace(/[^\w.-]/g, "_");
    const stamp = Date.now();

    let videoResult = null;
    let audioResult = null;

    const tasks = [];
    if (parsed.video) {
      tasks.push(
        processOne(parsed.video, `tiktok_${safeAuthor}_${stamp}.mp4`).then(
          (r) => {
            videoResult = r;
          }
        )
      );
    }
    if (parsed.audio) {
      tasks.push(
        processOne(parsed.audio, `tiktok_${safeAuthor}_${stamp}.mp3`).then(
          (r) => {
            audioResult = r;
          }
        )
      );
    }

    await Promise.all(tasks);

    const output = {
      ...CREDIT,
      status: true,
      result: {
        url: tiktokUrl,
        author: {
          name: parsed.author,
          avatar: parsed.avatar,
        },
        thumbnail: parsed.thumbnail,
        video: videoResult?.url || null,
        audio: audioResult?.url || null,
        stats: parsed.stats,
        size: {
          video: videoResult?.size || 0,
          audio: audioResult?.size || 0,
        },
      },
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    console.log(
      JSON.stringify(
        { ...CREDIT, status: false, message: err.message },
        null,
        2
      )
    );
    process.exit(1);
  }
})();
