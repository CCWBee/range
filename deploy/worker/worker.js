// range.charlesbee.org: a thin proxy in front of the GitHub Pages build.
//
// The desktop bundle is one HTML file of 29,672,355 bytes (28.3 MiB; the phone bundle is
// 11,100,697 bytes as served), over the 25 MiB per-file cap on
// Cloudflare Workers assets and Pages, so GitHub Pages stays the host (CI builds
// and publishes it on every push to master) and this Worker gives it the
// charlesbee.org address. Do not also set a custom domain on the repo's Pages
// settings: GitHub would then 301 ccwbee.github.io/range to this hostname and
// the proxy would fetch its own redirect in a loop.
const ORIGIN = "https://ccwbee.github.io";
const BASE = "/range";
const HOST = "https://range.charlesbee.org";

// GitHub's own edge headers, meaningless once the response leaves through Cloudflare. Age stays,
// so a browser does not grant a copy that is already old at the edge a fresh ten minutes.
const DROP = [
  "strict-transport-security", "x-github-request-id", "x-github-edge-region",
  "x-proxy-cache", "via", "x-served-by", "x-cache", "x-cache-hits", "x-timer",
  "x-fastly-request-id",
];
// Passed upstream so a revisit can be answered 304 instead of the full ~30 MB. Range and If-Range
// are deliberately not forwarded: the runtime asks GitHub for gzip, GitHub cuts the range from the
// gzip stream, and the client got bytes of the compressed file under a wrong total. A full 200 is
// always a valid answer to a range request.
const FORWARD = ["if-none-match", "if-modified-since"];

// The only paths this Worker answers. Everything else is the local 404 page, before any upstream
// fetch, so the proxy cannot be used to read the rest of ccwbee.github.io/range or to fill the
// edge cache with arbitrary keys. /social/ holds the og:video, its poster and nothing else, and is
// the only prefix Pages publishes beyond the files listed here (tools/build.py copies social/ into
// dist/social/).
const PATHS = new Set([
  "/", "/index.html", "/mobile.html", "/mobile", "/apple-touch-icon.png", "/RANGE.zip",
]);
const allowed = (path) => PATHS.has(path) || path.startsWith("/social/");

// The set in _tools/security-headers.md, with the one change it names for RANGE: the phone version
// flies by tilt, so accelerometer and gyroscope are allowed for this origin. No
// Content-Security-Policy on purpose: the single-file bundle inlines its textures and code as data:
// and blob:, so a policy narrow enough to mean anything blocks them and leaves a blank page
// (MAINTENANCE.md). Strict-Transport-Security is deliberately max-age=0, see below.
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(self), gyroscope=(self)",
  "X-Frame-Options": "DENY",
  // Same guardrail as the charlesbee.org hub (charlesbee-home/worker.js): never pin HSTS,
  // so a TLS-intercepting middlebox leaves a click-through warning rather than a hard block.
  "Strict-Transport-Security": "max-age=0",
};
const secure = (headers) => {
  for (const [k, v] of Object.entries(SECURITY)) headers.set(k, v);
  return headers;
};

// /social/* files are named with their date (og-range-2026-10-31.mp4), so a new picture is a new
// name and an old one never changes: a year at the edge and in every client, and any origin may read
// them, which is what a link-preview fetcher or an embed needs.
const SOCIAL_CACHE = "public, max-age=31536000, immutable";
const SOCIAL_TTL = 31536000;

// The byte-range server below is shared with the other sites' Workers (MEDIA, parseRange,
// ifRangeAllows, sliceStream and serveRange are copied unchanged). Messages and Safari will not take
// a video from a server that cannot answer a Range request with 206.
const MEDIA = /\.(mp4|m4v|mov|webm)$/i;

export function parseRange(header, size) {
  // Returns {start, end} (inclusive), "unsatisfiable", or null when the header is to be ignored.
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const n = Number(m[2]);                       // suffix: the last n bytes
    if (n === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Number(m[2]);
  if (m[2] !== "" && end < start) return null;    // invalid first-last pair
  if (start >= size) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

function ifRangeAllows(value, headers) {
  const v = value.trim();
  if (v.startsWith('"') || v.startsWith("W/")) {  // an entity tag: strong comparison only
    const etag = headers.get("ETag");
    return !!etag && !etag.startsWith("W/") && !v.startsWith("W/") && etag === v;
  }
  const lm = headers.get("Last-Modified");        // an HTTP date: exact match with Last-Modified
  return !!lm && Date.parse(lm) === Date.parse(v);
}

function sliceStream(body, start, end) {
  // Passes bytes start..end (inclusive) of the body through, then stops reading the source.
  let pos = 0;
  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      const from = pos;
      pos += chunk.byteLength;
      if (pos <= start) return;
      controller.enqueue(chunk.subarray(Math.max(start, from) - from, Math.min(end + 1, pos) - from));
      if (pos > end) controller.terminate();
    },
  }));
}

// Canonical copy: E:\claude-projects\do-less\deploy\worker.js (registered in _tools\README.md).
// Change it there first, run _tools\check-serve-range.mjs, then copy.
// serveRange() is the byte-range server itself, for any source of the whole file: the static
// assets here, an upstream fetch in RANGE's proxy. fetchWhole(headers) is called once, with the
// request's headers minus Range and If-Range, and resolves to the source's full response. A 200 is
// sliced; any other status (304, 404) is passed through unchanged.
export async function serveRange(request, fetchWhole) {
  const rangeHeader = request.headers.get("Range");
  const ifRange = request.headers.get("If-Range");
  // Ask the source for the whole file: the assets ignore Range, and without it they send their
  // usual ETag and Cache-Control on the response we slice.
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.delete("Range");
  upstreamHeaders.delete("If-Range");
  const res = await fetchWhole(upstreamHeaders);
  if (res.status !== 200) return res;

  const full = new Headers(res.headers);
  full.set("Accept-Ranges", "bytes");
  const whole = () => new Response(request.method === "HEAD" ? null : res.body, { status: 200, headers: full });
  if (request.method !== "GET" || !rangeHeader) return whole();

  let size = Number(res.headers.get("Content-Length"));
  let buf = null;
  if (!res.headers.has("Content-Length") || !Number.isFinite(size)) {
    buf = await res.arrayBuffer();               // length unknown: the only case that buffers
    size = buf.byteLength;
  }
  const range = parseRange(rangeHeader, size);
  if (range === null || (ifRange && !ifRangeAllows(ifRange, res.headers))) {
    return new Response(buf || res.body, { status: 200, headers: full });
  }
  if (range === "unsatisfiable") {
    if (!buf) res.body?.cancel();
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
  }
  const h = new Headers(res.headers);
  h.set("Accept-Ranges", "bytes");
  h.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  h.set("Content-Length", String(range.end - range.start + 1));
  let body;
  if (buf) {
    body = buf.slice(range.start, range.end + 1);
  } else {
    body = sliceStream(res.body, range.start, range.end);
    if (typeof FixedLengthStream === "function") {
      // The Workers runtime ignores a hand-set Content-Length on a streamed body and sends it chunked;
      // only a FixedLengthStream carries its length. (Node has none, so the plain stream is used there.)
      // The pipe is not awaited: the response starts as soon as the first bytes arrive.
      const fixed = new FixedLengthStream(range.end - range.start + 1);
      body.pipeTo(fixed.writable).catch(() => {});
      body = fixed.readable;
    }
  }
  return new Response(body, { status: 206, headers: h });
}

const NOT_FOUND = `<!doctype html><html lang="en-GB"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found · RANGE</title>
<style>html{background:#141b20;color:#eceded;font:16px/1.6 Arial,Helvetica,sans-serif}
main{max-width:32em;margin:18vh auto;padding:0 24px}h1{font-weight:400;letter-spacing:.17em;margin:0 0 12px}
a{color:#eceded}</style>
<main><h1>RANGE</h1><p>There is nothing at this address. The demo is at <a href="/">range.charlesbee.org</a>.</p></main>`;

const notFound = (request) => new Response(request.method === "HEAD" ? null : NOT_FOUND, {
  status: 404,
  headers: secure(new Headers({ "Content-Type": "text/html; charset=utf-8" })),
});

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cfv = request.headers.get("cf-visitor") || "";
    if (url.protocol === "http:" || cfv.includes('"scheme":"http"')) {
      url.protocol = "https:";
      return new Response(null, { status: 301, headers: secure(new Headers({ Location: url.toString() })) });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: secure(new Headers({ Allow: "GET, HEAD" })) });
    }
    if (!allowed(url.pathname)) return notFound(request);

    // Path only: the pages ignore the query (?desktop=1 and ?touch=1 are read in the browser), and
    // leaving it out keeps one edge copy per file rather than one per query string.
    const upstream = ORIGIN + BASE + url.pathname;
    const social = url.pathname.startsWith("/social/");
    // Pages publishes with max-age=600; hold the same at the edge, errors not at all. The dated
    // /social/ names never change, so the edge keeps them for a year.
    // cacheEverything is what makes the HTML cacheable at all: Cloudflare caches by file
    // extension by default and treats .html as dynamic, so without it every visit fetched the
    // whole file from GitHub again.
    const cf = { cacheEverything: true, cacheTtlByStatus: { "200-299": social ? SOCIAL_TTL : 600, "404": 60, "500-599": 0 } };
    // The whole file is always fetched, with only the conditional headers: the request's own Range,
    // If-Range, cookies and the rest never reach GitHub.
    const fetchWhole = (source) => {
      const forward = new Headers();
      FORWARD.forEach(h => { const v = source.get(h); if (v) forward.set(h, v); });
      return fetch(upstream, { method: request.method, headers: forward, redirect: "manual", cf });
    };
    // A video under /social/ is cut into byte ranges here; everything else is passed through.
    const res = social && MEDIA.test(url.pathname)
      ? await serveRange(request, (headers) => fetchWhole(headers))
      : await fetchWhole(request.headers);

    if (res.status === 404) return notFound(request);

    const headers = new Headers(res.headers);
    DROP.forEach(h => headers.delete(h));
    secure(headers); // after the drop: GitHub's HSTS goes, ours (max-age=0) stays
    if (social && (res.status < 400 || res.status === 416)) {
      headers.set("Cache-Control", SOCIAL_CACHE);
      headers.set("Access-Control-Allow-Origin", "*");
    }

    const location = headers.get("Location");
    if (location) {
      const abs = new URL(location, upstream);
      if (abs.origin === ORIGIN && (abs.pathname === BASE || abs.pathname.startsWith(BASE + "/"))) {
        headers.set("Location", HOST + (abs.pathname.slice(BASE.length) || "/") + (abs.search || url.search) + abs.hash);
      }
    }

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
