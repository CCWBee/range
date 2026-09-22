// range.charlesbee.org: a thin proxy in front of the GitHub Pages build.
//
// The desktop bundle is one ~29.6 MB HTML file, over the 25 MiB per-file cap on
// Cloudflare Workers assets and Pages, so GitHub Pages stays the host (CI builds
// and publishes it on every push to master) and this Worker gives it the
// charlesbee.org address. Do not also set a custom domain on the repo's Pages
// settings: GitHub would then 301 ccwbee.github.io/range to this hostname and
// the proxy would fetch its own redirect in a loop.
const ORIGIN = "https://ccwbee.github.io";
const BASE = "/range";
const HOST = "https://range.charlesbee.org";

// GitHub's own edge headers, meaningless once the response leaves through Cloudflare.
const DROP = [
  "strict-transport-security", "x-github-request-id", "x-github-edge-region",
  "x-proxy-cache", "via", "x-served-by", "x-cache", "x-cache-hits", "x-timer",
  "x-fastly-request-id", "age",
];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cfv = request.headers.get("cf-visitor") || "";
    if (url.protocol === "http:" || cfv.includes('"scheme":"http"')) {
      url.protocol = "https:";
      return new Response(null, { status: 301, headers: { Location: url.toString() } });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const upstream = ORIGIN + BASE + url.pathname + url.search;
    const res = await fetch(upstream, {
      method: request.method,
      redirect: "manual",
      // Pages publishes with max-age=600; hold the same at the edge, errors not at all.
      cf: { cacheTtlByStatus: { "200-299": 600, "404": 60, "500-599": 0 } },
    });

    const headers = new Headers(res.headers);
    DROP.forEach(h => headers.delete(h));
    // Same guardrail as the charlesbee.org hub (charlesbee-home/worker.js): never pin HSTS,
    // so a TLS-intercepting middlebox leaves a click-through warning rather than a hard block.
    headers.set("Strict-Transport-Security", "max-age=0");

    const location = headers.get("Location");
    if (location) {
      const abs = new URL(location, upstream);
      if (abs.origin === ORIGIN && (abs.pathname === BASE || abs.pathname.startsWith(BASE + "/"))) {
        headers.set("Location", HOST + (abs.pathname.slice(BASE.length) || "/") + abs.search + abs.hash);
      }
    }

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
