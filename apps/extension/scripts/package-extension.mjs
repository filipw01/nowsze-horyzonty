import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const archive = resolve(root, "nowsze-horyzonty-extension.zip");

rmSync(archive, { force: true });
execFileSync("zip", ["-r", archive, ".", "-x", "*.map"], {
  cwd: dist,
  stdio: "inherit"
});

console.log(`Packaged extension at ${archive}`);
