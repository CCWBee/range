Part of the [project-management](../project-management/README.md) system.

# range -- maintenance

RANGE, the self-contained three.js flight demo over Jersey, as a live site.

- Live: https://range.charlesbee.org and https://ccwbee.github.io/range/ (the phone build is
  `mobile.html` beside each; the offline zip is `RANGE.zip`)
- Repo: CCWBee/range (public), branch `master`
- Listed on the hub: charlesbee.org (`charlesbee-home/public/index.html`, the `PROJECTS` array)

## Stack & hosting

- GitHub Pages is the host. `.github/workflows/pages.yml` installs `tools/requirements.txt`, runs
  `node tools/test_flight.mjs`, then `python tools/build.py`, and publishes `dist/` (plus `RANGE.zip`) on every push to `master`. It
  only runs while the repo variable `PAGES_ENABLED` is `true`.
- `range.charlesbee.org` is the Cloudflare Worker `range-charlesbee` (source `deploy/worker/`), a
  thin proxy that fetches `https://ccwbee.github.io/range/<path>` and streams it back. It exists
  because `dist/index.html` is 29,672,355 bytes (28.3 MiB; `dist/mobile.html` is about 11.1 MB), over
  the 25 MiB per-file cap on Workers assets and Pages, so Cloudflare cannot host the file directly.
  It 301s http to https, answers only `/`, `/index.html`, `/mobile.html`, `/mobile`,
  `/apple-touch-icon.png`, `/RANGE.zip` and anything under `/social/` (the og:video and its poster;
  every other path is the local 404 page with no upstream fetch), allows GET and HEAD
  only (anything else is a 405 with `Allow: GET, HEAD`), forwards `If-None-Match` and `If-Modified-Since` (so a revisit is a 304 rather than the
  whole file again; `Range` is deliberately not forwarded, because GitHub cut ranges from its gzip
  stream and the client got compressed bytes under a wrong total, so a range request for a page gets the
  full 200; for the mp4 under `/social/` the Worker fetches the whole file and cuts the 206 itself), keys the upstream on the path only (the query is read in
  the browser), rewrites GitHub's `Location` headers onto the charlesbee.org host, drops GitHub's
  edge headers but keeps `Age`, sets HSTS `max-age=0` (the charlesbee.org guardrail), sets the
  security headers below, serves a plain RANGE 404 instead of GitHub's branded page, and caches the
  HTML at the edge for 600 s, matching Pages' own `max-age=600` (`cacheEverything: true`, because
  Cloudflare treats `.html` as uncacheable by default: before this a visit fetched the whole file
  from GitHub again, and a second request is now `CF-Cache-Status: HIT`). The zone's Browser Cache TTL raises non-HTML files (the zip,
  the touch icon) to `max-age=14400` in the browser; HTML keeps 600.
- The Worker is on the same Cloudflare account and `charlesbee.org` zone as the hub and Caesar.
  `custom_domain = true` in `deploy/worker/wrangler.toml` makes wrangler own the DNS record and
  the certificate.

## Link preview (og:video)

`index.html` carries the `og:` and `twitter:` tags for both bundles; the media live in `social/` and
publish to `/social/` through `tools/build.py`. Every `/social/*` response below 400, and a 416, carries
`Cache-Control: public, max-age=31536000, immutable` and `Access-Control-Allow-Origin: *` (a 404 or
an upstream error does not, so a miss is never pinned for a year), and the edge holds a file for a year, so a file is never changed under its name: add a new dated name and change
the URLs in `index.html`. The mp4 is answered with byte ranges by `serveRange`, which Safari and
Messages need; it is the shared copy from `do-less\deploy\worker.js` (guard:
`node E:\claude-projects\_tools\check-serve-range.mjs`). Check after a deploy:
`curl.exe -s -o NUL -w "%{http_code} %{size_download}" -H "Range: bytes=0-1" https://range.charlesbee.org/social/og-range-card-2026-11-04.mp4`
returns `206 2`.

## Security headers

The Worker sends the set in `E:\claude-projects\_tools\security-headers.md` on every response it
makes (pages, media, 301, 404 and 405): `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(self), gyroscope=(self)`.
The two sensors are the exception to the standard value: the phone version flies by tilt.

There is deliberately no `Content-Security-Policy` from the Worker, which is an exception to that
file. The single-file bundle inlines its textures and code as `data:` and `blob:` URLs, so a policy
tight enough to mean anything would block them and leave a blank page, and a loose one buys nothing.
The page carries its own `<meta>` policy with `connect-src 'none'`. If a Worker policy is ever added,
check it in Brave with the console open before deploying.

## Deploy

- The demo: push to `master`. CI tests, builds and publishes; both addresses serve the new build
  within about ten minutes (the Worker's edge copy expires after 600 s).
- The proxy (only when `deploy/worker/` changes), logged into Cloudflare:

```powershell
cd E:\claude-projects\range\deploy\worker
npx wrangler deploy
```

- Check: `curl.exe -sI https://range.charlesbee.org/` returns 200, `text/html`,
  `Strict-Transport-Security: max-age=0` and the security headers above, and a second request shows
  `CF-Cache-Status: HIT`; `curl.exe -s -o NUL -w "%{http_code}" https://range.charlesbee.org/anything-else`
  returns 404 and a POST returns 405; `node deploy/worker/test-worker.mjs` runs the same behaviour
  offline against a stubbed upstream; `curl.exe -s -o NUL -w "%{size_download}" https://range.charlesbee.org/`
  matches the same for `https://ccwbee.github.io/range/`; the same request with
  `-H "If-Modified-Since: <its Last-Modified>"` returns 304 and 0 bytes.

## External dependencies & accounts

| Service | Purpose | Account | Cost |
| --- | --- | --- | --- |
| GitHub Pages + Actions | Build and host | GitHub CCWBee | Free (public repo) |
| Cloudflare Workers | range.charlesbee.org proxy, DNS and TLS | Charles's Cloudflare account (the `charlesbee.org` zone) | Free tier |
| Git LFS | `assets/RANGE.blend` | GitHub CCWBee | Free quota |

No secrets, no APIs, no analytics. The page's own CSP is `connect-src 'none'`. CI installs the
Python build dependencies from `tools/requirements.txt` (exact Pillow and numpy versions), so a
rebuild does not drift with PyPI; bump the pins deliberately.

## Known fragilities & gotchas

- Never set a custom domain in the repo's Pages settings. GitHub would then 301
  `ccwbee.github.io/range` to `range.charlesbee.org`, and the proxy would fetch its own redirect.
- Making the repo private deletes its Pages config (the qr-decoder outage of 28 July 2026), which
  takes down both addresses.
- The per-file cap is why this is a proxy. If the desktop bundle ever drops under 25 MiB, an
  assets Worker could host `dist/` directly and the proxy could go.
- Two owner decisions are still open (see `STATE.md` and `PROJECTS.md`): a licence file, and
  whether the Crown-copyright Typhoon adaptation may stay in a public repo.
