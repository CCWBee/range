# Audit fixes for RANGE, 31 October 2026

Source: the portfolio backend audit, estate "range", in
`E:\claude-projects\charlesbee-home\out\2026-10-31-portfolio-backend-audit.md` (read it for the
evidence behind each item). Work on `master` in this repo. No push and no `wrangler deploy`: a push
redeploys GitHub Pages, so the owner approves it separately. Run no headless browser.

## Changes

1. **Proxy Worker (`deploy/worker/worker.js`, `wrangler.toml`).**
   - Allowlist: answer only `/`, `/index.html`, `/mobile.html`, `/mobile`, `/apple-touch-icon.png`,
     `/RANGE.zip`, `/og.png` and anything under `/social/` (reserved for the og:video pass). Every
     other path gets the existing local 404 page before any upstream fetch.
   - Methods: GET and HEAD only; anything else 405 with `Allow: GET, HEAD`.
   - Cache the HTML at the edge: `cacheEverything: true` alongside the existing `cacheTtlByStatus`,
     so a second request is a `CF-Cache-Status: HIT`. Keep forwarding only the conditional headers
     (a revisit stays a 304) and keep Range out (commit `05c502a` explains why).
   - Security headers from `E:\claude-projects\_tools\security-headers.md`, with
     `Permissions-Policy` allowing `accelerometer=(self), gyroscope=(self)` (the phone version flies
     by tilt) and **no CSP**: the single-file bundle inlines its textures and code as `data:` and
     `blob:`, so a CSP buys nothing there and risks a blank page. Say so in `MAINTENANCE.md`.
   - Correct the comments to the measured sizes (index 29,672,355 bytes, 28.3 MiB; mobile 11,100,697).
   - A small test, `deploy/worker/test-worker.mjs` (Node, no dependencies): call the Worker's fetch
     handler with a stubbed global `fetch` and assert on what it returns: an unknown path is 404 with
     no upstream call, POST is 405, `/` forwards `If-None-Match` and drops `Range`, the response
     carries the security headers. Assert on behaviour, never on source text.
2. **CI (`.github/workflows/pages.yml`).** Pin the build dependencies: `tools/requirements.txt` with
   the exact Pillow and numpy versions the last green run installed (read them from
   `gh run view <id> --log`), installed with `pip install -r tools/requirements.txt`. Run
   `node tools/test_flight.mjs` as a step before the build.
3. **`RANGE.zip`**: `tools/build.py` also writes a `NOTICE.txt` into the zip, carrying the
   "Credits and licences" section of `README.md` as it stands.
4. **`STATE.md`** to the four-heading contract (Where it stands, Open threads, Next action,
   Gotchas). Move the Done and Earlier sections verbatim into `docs/notes/state-history.md`; drop
   from the open lists what `2412d91` already shipped (hedge lines, the meadow and farmland split,
   island-wide clutter, town lights, the Wyvern throttle wording). Open threads keep: the on-device
   phone check, the Blender items (Noirmont, Fort Henry, the St Ouen wall), the harnesses not run to
   completion, the Typhoon licence decision, the favicon redraw and the look pass (both in progress
   on 31 October).
5. **`MAINTENANCE.md`**: the measured sizes, the caching text made true (HTML now cached at the
   edge), the security-header exception above.

## Not in this pass

og and twitter tags and the og image (the og:video pass), the Typhoon airframe and the licence files
(owner decisions), the repository description and a WAF rate rule (console steps), the favicon and
the look (their own pages).

## Check

`node tools/test_flight.mjs && node --check deploy/worker/worker.js && node deploy/worker/test-worker.mjs && python tools/build.py`
exits 0. House rules: British English, no em dashes, in comments and docs too.
