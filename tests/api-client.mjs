import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = await mkdtemp(join(tmpdir(), "amora-client-"));
const outfile = join(tmp, "api.mjs");
await build({
  entryPoints: [join(root, "frontend/src/api.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});
let current = "session-for-test",
  removed = 0,
  calls = 0,
  logout = 0;
globalThis.sessionStorage = {
  getItem: () => current,
  removeItem: () => {
    current = null;
    removed++;
  },
};
globalThis.window = { dispatchEvent: () => logout++ };
const { api, ApiError } = await import(pathToFileURL(outfile));
globalThis.fetch = async () => {
  calls++;
  throw new TypeError("offline");
};
await assert.rejects(
  api("/auth/me"),
  (e) => e instanceof ApiError && e.status === 0,
);
assert.equal(current, "session-for-test");
assert.equal(removed, 0);
assert.equal(calls, 1);
globalThis.fetch = async () =>
  new Response("<html>Starting</html>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
await assert.rejects(api("/auth/me"), (e) => e.status === 502);
assert.equal(current, "session-for-test");
calls = 0;
globalThis.fetch = async () => {
  calls++;
  return new Response('{"message":"Busy"}', {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
};
await assert.rejects(api("/orders", "POST", {}), (e) => e.status === 503);
assert.equal(calls, 1, "Never retry a POST after an uncertain result");
assert.equal(current, "session-for-test");
globalThis.fetch = async () =>
  new Response('{"message":"Expired"}', {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
await assert.rejects(api("/auth/me"), (e) => e.status === 401);
assert.equal(current, null);
assert.equal(logout, 1);
console.log(
  "PASS: API client offline/HTML/cold-start errors, retained session, no POST replay, and 401 logout.",
);
