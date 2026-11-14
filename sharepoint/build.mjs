import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(fileURLToPath(import.meta.url));
execFileSync(
  process.execPath,
  [
    path.join(root, "../node_modules/typescript/bin/tsc"),
    "-p",
    path.join(root, "tsconfig.json"),
  ],
  { stdio: "inherit" },
);
await build({
  entryPoints: [path.join(root, "src/diagnostic.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: false,
  outfile: path.join(root, "dist/read-only-test.js"),
  banner: {
    js: "// INVITE DEV site read-only diagnostic. Review source before running. GET requests only; no records created.",
  },
});
await build({
  entryPoints: [path.join(root, "src/index.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: path.join(root, "dist/sharepoint-services.js"),
});
console.log(
  "SharePoint adapter type-check/build passed. Read-only snippet: sharepoint/dist/read-only-test.js. No network calls or deployment performed.",
);
