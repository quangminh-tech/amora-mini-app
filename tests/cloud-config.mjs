import assert from "node:assert/strict";
import { apiOrigin } from "../frontend/scripts/cloud-config.mjs";
assert.equal(
  apiOrigin("https://amora-api.onrender.com/"),
  "https://amora-api.onrender.com",
);
assert.equal(apiOrigin(""), "");
assert.throws(() => apiOrigin("", true));
for (const value of [
  "http://api.test",
  "https://api.test/api",
  "https://user:secret@api.test",
  "https://api.test?token=x",
  "https://api.test/#x",
  "invalid",
])
  assert.throws(() => apiOrigin(value, true));
console.log("PASS: 9 cloud API origin configuration checks.");
