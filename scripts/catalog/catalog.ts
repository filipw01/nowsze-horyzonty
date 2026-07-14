import { readFile, writeFile } from "node:fs/promises";
import type { NhFilmKey } from "@nowsze-horyzonty/shared";
import type { CatalogRecord, DraftFilm, ImdbDatasetRecord, MetacriticMatch } from "./types.js";

const CATALOG_PATH = "data/films.json";
const DRAFT_PATH = "data/films.draft.json";
export const GENERATED_PATH = "data/films.generated.json";
export const IMDB_MATCH_REPORT_PATH = "data/films.imdb-match-report.json";

export async function readCatalog(path = CATALOG_PATH): Promise<CatalogRecord[]> {
  return JSON.parse(await readFile(path, "utf8")) as CatalogRecord[];
}

export async function readDrafts(path = DRAFT_PATH): Promise<DraftFilm[]> {
  return JSON.parse(await readFile(path, "utf8")) as DraftFilm[];
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function catalogByKey(records: CatalogRecord[]): Map<NhFilmKey, CatalogRecord> {
  return new Map(records.map((record) => [record.nhKey, record]));
}

export function proposedCatalogRecord(draft: DraftFilm, existing: CatalogRecord | undefined, imdbId: string): CatalogRecord {
  const rawSourcesPrivate = {
    ...existing?.rawSourcesPrivate,
    ...draft.rawSourcesPrivate
  };
  const record: CatalogRecord = {
    ...existing,
    active: existing?.active ?? true,
    nhKey: draft.nhKey,
    festivalTitle: draft.festivalTitle,
    imdbId,
    summaryPl: existing?.summaryPl ?? ""
  };

  if (draft.originalTitle) record.originalTitle = draft.originalTitle;
  else delete record.originalTitle;
  if (draft.noweHoryzontyUrl) record.noweHoryzontyUrl = draft.noweHoryzontyUrl;
  if (draft.trailerCandidates) record.trailerCandidates = draft.trailerCandidates;
  if (Object.keys(rawSourcesPrivate).length) record.rawSourcesPrivate = rawSourcesPrivate;
  return record;
}

export function patchImdbRecord(
  record: CatalogRecord,
  data: ImdbDatasetRecord | undefined,
  description: string | undefined,
  hasSuccessfulLookup: boolean
): CatalogRecord {
  const patched: CatalogRecord = { ...record };

  if (hasSuccessfulLookup) patched.imdbUrl = `https://www.imdb.com/title/${record.imdbId}/`;
  if (data?.imdbRating) patched.imdbRating = data.imdbRating;
  if (data?.imdbVotes !== undefined) patched.imdbVotes = data.imdbVotes;
  if (data?.genre) patched.genre = data.genre;
  if (data && (data.imdbRating || data.imdbVotes !== undefined || data.genre)) patched.imdbDataFetchedAt = data.fetchedAt;

  if (description) {
    patched.rawSourcesPrivate = {
      ...record.rawSourcesPrivate,
      imdbDescription: description,
      imdbDescriptionFetchedAt: new Date().toISOString()
    };
  }

  return patched;
}

export function patchMetacriticRecord(record: CatalogRecord, match: MetacriticMatch | undefined): CatalogRecord {
  if (!match) return record;

  const patched: CatalogRecord = {
    ...record,
    metascore: match.metascore,
    metacriticUrl: match.metacriticUrl,
    metacriticDataFetchedAt: match.fetchedAt
  };
  if (match.criticsReviewCount !== undefined) patched.criticsReviewCount = match.criticsReviewCount;
  return patched;
}
