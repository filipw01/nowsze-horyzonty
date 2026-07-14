declare module "virtual:film-catalog" {
  import type { EmbeddedFilmRecord } from "./film-catalog.js";

  export const embeddedFilmCatalog: readonly EmbeddedFilmRecord[];
}
