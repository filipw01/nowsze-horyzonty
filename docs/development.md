# Nowsze Horyzonty Extension

## Extension

```sh
npm install
npm run build:extension
```

Load `apps/extension/dist` as an unpacked extension in Chrome or Firefox.

The build embeds a public projection of `data/films.json` directly in the extension. No API or environment configuration is required.

## Data

```sh
npm run nh:discover
npm run nh:draft
npm run nh:match-imdb
npm run nh:enrich-imdb
npm run nh:enrich-metacritic
```

`nh:match-imdb` writes proposed records to `data/films.generated.json` and the validation evidence to `data/films.imdb-match-report.json`. Existing catalog IDs are retained only after title, year, title-type, and director validation. Use `npm run nh:match-imdb -- --rematch` to ignore saved IDs and match every draft again.

After reviewing and applying proposed records to `data/films.json`, run the enrichment commands independently. `nh:enrich-imdb` is the command to rerun when only IMDb ratings, votes, genres, and private IMDb descriptions need refreshing. It does not change festival data, Metacritic data, trailers, active state, or `summaryPl`.

The catalog keeps both Nowe Horyzonty and IMDb descriptions in `rawSourcesPrivate`. A later LLM workflow uses those private descriptions to prepare a Polish `summaryPl`; these catalog commands never generate or overwrite summaries.
