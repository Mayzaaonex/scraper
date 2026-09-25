/**
 * stepdownimage.js
 * Getty Images Downloader via steptodown.com
 * Author  : Mayzaa
 * Credit  : Mayzaa
 * Usage   : node stepdownimage.js <getty-url> [--json]
 * Example : node stepdownimage.js "https://www.gettyimages.co.uk/detail/photo/smiling-nurse-communicating-with-patient-royalty-free-image/2195485435"
 */

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const https = require("https");

const AUTHOR = "Mayzaa";

const args = process.argv.slice(2);
const JSON_MODE = args.includes("--json");
const gettyUrl = args.find((a) => !a.startsWith("--"));

const log = (...a) => {
  if (!JSON_MODE) console.log(...a);
  else console.error(...a);
};

log(`\n🖼️   Getty Images Downloader — by ${AUTHOR}\n`);

if (!gettyUrl) {
  if (JSON_MODE) console.log(JSON.stringify({ success: false, error: "No URL" }));
  else {
    console.log("Usage  : node stepdownimage.js <getty-url> [--json]");
    console.log("Example: node stepdownimage.js \"https://www.gettyimages.co.uk/detail/photo/.../2195485435\"");
  }
  process.exit(1);
}

const BASE = "https://steptodown.com";
const GET_PHP = `${BASE}/getty-images-downloader/get.php`;
const IMG_BASE = `${BASE}/getty-images-downloader/`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const COOKIE = [
  "hcdn=AQEAancVswAQiOBxB_xF-BbwDWfoZZgaLJzCA36V6dkUCWmBHq5qAAAAAAAMAQAhEk1P1JG_hkb2KkIjgeaAAAAAVB9iTSYaClSosgGboleUww",
  "PHPSESSID=9163mfi1p9vq44jsc01copd56t",
  "pll_language=en",
].join("; ");

const client = axios.create({
  baseURL: BASE,
  headers: {
    "User-Agent": UA,
    Cookie: COOKIE,
    "Accept-Language": "en-US,en;q=0.9",
  },
  timeout: 60000,
});

function extractImagePath(html) {
  const $ = cheerio.load(html);

  let path = $('a[download][href*="images/"]').attr("href");
  if (!path) path = $('img[src*="images/steptodown"]').attr("src");

  if (!path) {
    const m = html.match(/images\/steptodown\.com\d+\.jpg/i);
    if (m) path = m[0];
  }

  return path || null;
}

function extractResolution(html) {
  const $ = cheerio.load(html);
  const h2 = $("h2.title")
    .toArray()
    .map((el) => $(el).text().trim())
    .find((t) => /\d+\s*x\s*\d+/.test(t));
  if (h2) {
    const m = h2.match(/(\d+)\s*x\s*(\d+)/);
    if (m) return { width: parseInt(m[1]), height: parseInt(m[2]) };
  }
  return null;
}

function downloadImage(url, outPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        "User-Agent": UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        Referer: GET_PHP,
        Cookie: COOKIE,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
      },
    };

    https
      .get(url, opts, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          const next = res.headers.location;
          if (!next) return reject(new Error("Redirect tanpa location"));
          const abs = next.startsWith("http") ? next : BASE + next;
          return downloadImage(abs, outPath).then(resolve, reject);
        }

        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () =>
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 100)}`))
          );
          return;
        }

        const ctype = (res.headers["content-type"] || "").toLowerCase();
        if (!ctype.startsWith("image/")) {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () =>
            reject(new Error(`Bukan gambar (Content-Type: ${ctype})`))
          );
          return;
        }

        const total = parseInt(res.headers["content-length"] || "0", 10);
        let downloaded = 0;
        const writer = fs.createWriteStream(outPath);

        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (total && !JSON_MODE) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            process.stderr.write(`\r⬇️   ${pct}%`);
          }
        });
        res.pipe(writer);
        writer.on("finish", () => {
          if (!JSON_MODE) process.stderr.write("\n");
          resolve();
        });
        writer.on("error", reject);
      })
      .on("error", reject);
  });
}

(async () => {
  try {
    if (!COOKIE.includes("hcdn=")) {
      const err = { success: false, error: "Cookie hcdn belum diisi" };
      if (JSON_MODE) console.log(JSON.stringify(err));
      else console.error("❌ Cookie hcdn belum diisi!");
      process.exit(1);
    }

    log(`🔗 URL    : ${gettyUrl}`);

    log("📡 Request ke get.php...");
    const body = new URLSearchParams();
    body.append("url", gettyUrl);

    const { data: html } = await client.post(GET_PHP, body.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: BASE,
        Referer: BASE + "/getty-images-downloader/",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    const imgPath = extractImagePath(html);
    if (!imgPath) {
      throw new Error("Gambar tidak ditemukan di response HTML");
    }
    const imgUrl = imgPath.startsWith("http")
      ? imgPath
      : IMG_BASE + imgPath.replace(/^\/+/, "").replace(/^images\//, "images/");
    const resolution = extractResolution(html);

    log(`🖼️  Image  : ${imgPath}`);
    if (resolution) log(`📐 Resolusi: ${resolution.width} x ${resolution.height}`);

    const fileName = imgPath.split("/").pop();
    log(`🎬 Download ${fileName}...`);
    await downloadImage(imgUrl, fileName);

    const size = fs.statSync(fileName).size;

    if (JSON_MODE) {
      const result = {
        success: true,
        author: AUTHOR,
        url: gettyUrl,
        image: {
          file: fileName,
          path: imgPath,
          url: imgUrl,
          size,
          sizeFormatted: `${(size / 1024).toFixed(2)} KB`,
          resolution: resolution
            ? `${resolution.width}x${resolution.height}`
            : null,
        },
      };
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`✅ Selesai : ${fileName} (${(size / 1024).toFixed(1)} KB)`);
      console.log(`\n— by ${AUTHOR} —\n`);
    }
  } catch (err) {
    if (JSON_MODE) {
      console.log(
        JSON.stringify(
          {
            success: false,
            author: AUTHOR,
            url: gettyUrl,
            error: err.message,
            status: err.response?.status,
          },
          null,
          2
        )
      );
    } else {
      console.error("❌ Error:", err.response?.status || "", err.message);
    }
    process.exit(1);
  }
})();
