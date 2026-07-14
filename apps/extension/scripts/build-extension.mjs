import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import { projectCatalog } from "./catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const catalog = JSON.parse(readFileSync(resolve(root, "..", "..", "data", "films.json"), "utf8"));
const embeddedFilmCatalog = projectCatalog(catalog);

const embeddedFilmCatalogPlugin = {
  name: "embedded-film-catalog",
  setup(build) {
    build.onResolve({ filter: /^virtual:film-catalog$/ }, (args) => ({
      path: args.path,
      namespace: "embedded-film-catalog"
    }));
    build.onLoad({ filter: /.*/, namespace: "embedded-film-catalog" }, () => ({
      contents: `export const embeddedFilmCatalog = ${JSON.stringify(embeddedFilmCatalog)};`,
      loader: "js"
    }));
  }
};

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
  plugins: [embeddedFilmCatalogPlugin]
});

cpSync(resolve(root, "src/content.css"), resolve(dist, "content.css"));
cpSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));

console.log(`Built extension with ${embeddedFilmCatalog.length} catalog records`);
