import { serve } from "@hono/node-server";
import { readConfig } from "./config.js";
import { createApp } from "./app.js";
import { loadCuratedFilms } from "./films.js";

const config = readConfig();
const app = createApp({
  config,
  films: loadCuratedFilms()
});

serve(
  {
    fetch: app.fetch,
    port: config.port
  },
  (info) => {
    console.log(`nowsze-horyzonty API listening on http://localhost:${info.port}`);
  }
);
