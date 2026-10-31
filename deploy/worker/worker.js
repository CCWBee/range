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
// edge cache with arbitrary keys. /social/ is reserved for the og:video pass.
const PATHS = new Set([
  "/", "/index.html", "/mobile.html", "/mobile", "/apple-touch-icon.png", "/RANGE.zip", "/og.png",
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
    const forward = new Headers();
    FORWARD.forEach(h => { const v = request.headers.get(h); if (v) forward.set(h, v); });
    const res = await fetch(upstream, {
      method: request.method,
      headers: forward,
      redirect: "manual",
      // Pages publishes with max-age=600; hold the same at the edge, errors not at all.
      // cacheEverything is what makes the HTML cacheable at all: Cloudflare caches by file
      // extension by default and treats .html as dynamic, so without it every visit fetched the
      // whole file from GitHub again.
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 600, "404": 60, "500-599": 0 } },
    });

    if (res.status === 404) return notFound(request);

    const headers = new Headers(res.headers);
    DROP.forEach(h => headers.delete(h));
    secure(headers); // after the drop: GitHub's HSTS goes, ours (max-age=0) stays

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
