import { readFile, writeFile } from "node:fs/promises";
import { configuredApiOrigin } from "./cloud-config.mjs";
const origin = configuredApiOrigin();
const headers = await readFile("public/_headers", "utf8");
await writeFile(
  "dist/_headers",
  headers.replace(
    "connect-src 'self' https:",
    "connect-src 'self'" + (origin ? " " + origin : ""),
  ),
);
console.log("Hosting headers: exact API origin configured");
