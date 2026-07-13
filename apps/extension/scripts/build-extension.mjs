import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const apiBaseUrl = process.env.NH_API_BASE_URL || "http://localhost:8787";

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(root, "src/content.ts")],
  outfile: resolve(dist, "content.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: false,
  sourcemap: true,
  define: {
    __NH_API_BASE_URL__: JSON.stringify(apiBaseUrl)
  }
});

cpSync(resolve(root, "src/content.css"), resolve(dist, "content.css"));
cpSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));

console.log(`Built extension with API base ${apiBaseUrl}`);
