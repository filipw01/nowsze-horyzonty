# Nowsze Horyzonty Extension

## API

```sh
npm install
cp .env.example .env
npm run dev:api
```

The API loads the nearest `.env` file automatically. It serves static metadata from `data/films.json`; it does not fetch ratings at runtime.

The extension calls `POST /api/extension/films` with Nowe Horyzonty film keys. The backend owns the allowlist and static enrichment data in `data/films.json`.

## Extension

```sh
NH_API_BASE_URL=http://localhost:8787 npm run build:extension
```

Load `apps/extension/dist` as an unpacked extension in Chrome or Firefox.

## Data

```sh
npm run nh:discover
npm run nh:draft
npm run nh:generate-films
```

Review `data/films.draft.json`, choose the correct IMDb ids when the generation report marks low-confidence matches, then copy approved generated records into `data/films.json`. The generator reads IMDb public datasets for static rating, vote count, and genre fields. Keep `summaryPl` casual, memorable, and no longer than one sentence.

## Fly.io

```sh
cp fly.toml.example fly.toml
fly deploy
```
