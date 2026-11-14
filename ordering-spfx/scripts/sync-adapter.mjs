import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const target = new URL("../src/services/adapter/", import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ["client", "config", "schema", "roles", "repository"]) {
  await copyFile(
    new URL(`../../sharepoint/src/${name}.ts`, import.meta.url),
    new URL(`${name}.ts`, target),
  );
}
console.log(
  `Synced prepared adapter into ${fileURLToPath(target)}. Original adapter and Vite sources unchanged.`,
);
