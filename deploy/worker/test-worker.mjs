// Behaviour test for the proxy Worker. No dependencies: it loads worker.js, replaces the global
// fetch with a stub that records what the Worker would have sent to GitHub, and asserts on what
// the Worker returns and on which upstream requests it makes.
//   node deploy/worker/test-worker.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./worker.js", import.meta.url)), "utf8");
const worker = (await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"))).default;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " " + detail}`);
  if (!ok) failures++;
};

const calls = [];
let upstreamReply = () => new Response("<html>demo</html>", {
  status: 200,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Strict-Transport-Security": "max-age=31556952",
    "X-GitHub-Request-Id": "ABCD",
    "Age": "12",
  },
});
globalThis.fetch = async (input, init = {}) => {
  calls.push({ url: String(input), init });
  return upstreamReply();
};

const ask = async (url, init = {}) => {
  calls.length = 0;
  const res = await worker.fetch(new Request(url, init));
  return { res, calls: [...calls] };
};
const SECURITY = ["x-content-type-options", "referrer-policy", "permissions-policy", "x-frame-options"];
const hasSecurity = (res) => SECURITY.every(h => res.headers.get(h));

// An unknown path is the local 404 and never reaches GitHub.
for (const path of ["/docs/specs/2026-09-06-range-v2.md", "/assets/library.bin", "/index.htm", "/socialx", "/.git/config"]) {
  const { res, calls: made } = await ask("https://range.charlesbee.org" + path);
  check(`404 and no upstream fetch for ${path}`, res.status === 404 && made.length === 0, `status ${res.status}, ${made.length} calls`);
  check(`404 page carries the security headers for ${path}`, hasSecurity(res));
}
{
  const { res, calls: made } = await ask("https://range.charlesbee.org/nothing", { method: "HEAD" });
  check("HEAD on an unknown path is a 404 with no body and no fetch", res.status === 404 && (await res.text()) === "" && made.length === 0);
}

// Only GET and HEAD.
for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
  const { res, calls: made } = await ask("https://range.charlesbee.org/", { method, body: method === "DELETE" ? undefined : "x" });
  check(`${method} is 405 with Allow: GET, HEAD and no fetch`, res.status === 405 && res.headers.get("allow") === "GET, HEAD" && made.length === 0, `status ${res.status}`);
  check(`405 for ${method} carries the security headers`, hasSecurity(res));
}

// The allowed paths reach GitHub under /range, path only.
for (const path of ["/", "/index.html", "/mobile.html", "/mobile", "/apple-touch-icon.png", "/RANGE.zip", "/og.png", "/social/player.html"]) {
  const { res, calls: made } = await ask("https://range.charlesbee.org" + path + "?touch=1");
  check(`${path} is answered from /range${path}`,
    res.status === 200 && made.length === 1 && made[0].url === "https://ccwbee.github.io/range" + path, `status ${res.status}, ${made.map(c => c.url)}`);
}

// Conditional headers go through, Range and cookies do not, and the edge is told to cache HTML.
{
  const { res, calls: made } = await ask("https://range.charlesbee.org/", {
    headers: { "If-None-Match": '"abc"', "If-Modified-Since": "Mon, 01 Jan 2026 00:00:00 GMT", Range: "bytes=1000-", Cookie: "a=b" },
  });
  const sent = new Headers(made[0].init.headers);
  check("/ forwards If-None-Match", sent.get("if-none-match") === '"abc"');
  check("/ forwards If-Modified-Since", sent.get("if-modified-since") === "Mon, 01 Jan 2026 00:00:00 GMT");
  check("/ drops Range", !sent.has("range"));
  check("/ drops Cookie", !sent.has("cookie"));
  check("/ asks the edge to cache everything for 600 s", made[0].init.cf?.cacheEverything === true && made[0].init.cf?.cacheTtlByStatus?.["200-299"] === 600);
  check("/ response carries the security headers", hasSecurity(res));
  check("/ response permits tilt sensors for itself", /accelerometer=\(self\)/.test(res.headers.get("permissions-policy")) && /gyroscope=\(self\)/.test(res.headers.get("permissions-policy")));
  check("/ response sets no Content-Security-Policy", !res.headers.has("content-security-policy"));
  check("/ response pins no HSTS and drops GitHub's edge headers",
    res.headers.get("strict-transport-security") === "max-age=0" && !res.headers.has("x-github-request-id"));
  check("/ response keeps Age and the body", res.headers.get("age") === "12" && (await res.text()) === "<html>demo</html>");
}

// A revisit stays a 304, and an upstream 404 becomes the local page.
upstreamReply = () => new Response(null, { status: 304 });
{
  const { res } = await ask("https://range.charlesbee.org/", { headers: { "If-None-Match": '"abc"' } });
  check("a 304 from GitHub is a 304 with the security headers", res.status === 304 && hasSecurity(res), `status ${res.status}`);
}
upstreamReply = () => new Response("GitHub's own page", { status: 404 });
{
  const { res } = await ask("https://range.charlesbee.org/social/missing.html");
  const body = await res.text();
  check("an allowed path missing upstream gets the local 404 page", res.status === 404 && body.includes("There is nothing at this address") && hasSecurity(res));
}

// http goes to https, with the headers on the redirect.
{
  const { res, calls: made } = await ask("http://range.charlesbee.org/mobile.html");
  check("http is a 301 to https with no fetch", res.status === 301 && res.headers.get("location") === "https://range.charlesbee.org/mobile.html" && made.length === 0 && hasSecurity(res));
}

console.log(failures ? `${failures} failed` : "all PASS");
process.exit(failures ? 1 : 0);
