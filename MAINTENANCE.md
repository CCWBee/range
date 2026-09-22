Part of the [project-management](../project-management/README.md) system.

# range -- maintenance

RANGE, the self-contained three.js flight demo over Jersey, as a live site.

- Live: https://range.charlesbee.org and https://ccwbee.github.io/range/ (the phone build is
  `mobile.html` beside each; the offline zip is `RANGE.zip`)
- Repo: CCWBee/range (public), branch `master`
- Listed on the hub: charlesbee.org (`charlesbee-home/public/index.html`, the `PROJECTS` array)

## Stack & hosting

- GitHub Pages is the host. `.github/workflows/pages.yml` runs `node tools/test_flight.mjs`, then
  `python tools/build.py`, and publishes `dist/` (plus `RANGE.zip`) on every push to `master`. It
  only runs while the repo variable `PAGES_ENABLED` is `true`.
- `range.charlesbee.org` is the Cloudflare Worker `range-charlesbee` (source `deploy/worker/`), a
  thin proxy that fetches `https://ccwbee.github.io/range/<path>` and streams it back. It exists
  because `dist/index.html` is about 29.6 MB, over the 25 MiB per-file cap on Workers assets and
  Pages, so Cloudflare cannot host the file directly. It 301s http to https, allows GET and HEAD
  only, rewrites GitHub's `Location` headers onto the charlesbee.org host, drops GitHub's edge
  headers, sets HSTS `max-age=0` (the charlesbee.org guardrail) and holds 2xx responses at the edge
  for 600 s, matching Pages' own `max-age=600`.
- The Worker is on the same Cloudflare account and `charlesbee.org` zone as the hub and Caesar.
  `custom_domain = true` in `deploy/worker/wrangler.toml` makes wrangler own the DNS record and
  the certificate.

## Deploy

- The demo: push to `master`. CI tests, builds and publishes; both addresses serve the new build
  within about ten minutes (the Worker's edge copy expires after 600 s).
- The proxy (only when `deploy/worker/` changes), logged into Cloudflare:

```powershell
cd E:\claude-projects\range\deploy\worker
npx wrangler deploy
```

- Check: `curl.exe -sI https://range.charlesbee.org/` returns 200, `text/html`,
  `Strict-Transport-Security: max-age=0`; `curl.exe -s -o NUL -w "%{size_download}" https://range.charlesbee.org/`
  matches the same for `https://ccwbee.github.io/range/`.

## External dependencies & accounts

| Service | Purpose | Account | Cost |
| --- | --- | --- | --- |
| GitHub Pages + Actions | Build and host | GitHub CCWBee | Free (public repo) |
| Cloudflare Workers | range.charlesbee.org proxy, DNS and TLS | Charles's Cloudflare account (the `charlesbee.org` zone) | Free tier |
| Git LFS | `assets/RANGE.blend` | GitHub CCWBee | Free quota |

No secrets, no APIs, no analytics. The page's CSP is `connect-src 'none'`.

## Known fragilities & gotchas

- Never set a custom domain in the repo's Pages settings. GitHub would then 301
  `ccwbee.github.io/range` to `range.charlesbee.org`, and the proxy would fetch its own redirect.
- Making the repo private deletes its Pages config (the qr-decoder outage of 28 July 2026), which
  takes down both addresses.
- The per-file cap is why this is a proxy. If the desktop bundle ever drops under 25 MiB, an
  assets Worker could host `dist/` directly and the proxy could go.
- Two owner decisions are still open (see `STATE.md` and `PROJECTS.md`): a licence file, and
  whether the Crown-copyright Typhoon adaptation may stay in a public repo.
