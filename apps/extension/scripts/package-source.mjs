import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(extensionRoot, "..", "..");
const archive = resolve(extensionRoot, "nowsze-horyzonty-extension-source.zip");

rmSync(archive, { force: true });
execFileSync(
  "zip",
  [
    "-r",
    archive,
    "package.json",
    "package-lock.json",
    "tsconfig.base.json",
    "data/films.json",
    "packages/shared/package.json",
    "packages/shared/tsconfig.json",
    "packages/shared/src",
    "apps/extension/AMO-SOURCE.md",
    "apps/extension/package.json",
    "apps/extension/tsconfig.json",
    "apps/extension/manifest.json",
    "apps/extension/assets",
    "apps/extension/src",
    "apps/extension/scripts"
  ],
  { cwd: root, stdio: "inherit" }
);

console.log(`Packaged AMO source archive at ${archive}`);
