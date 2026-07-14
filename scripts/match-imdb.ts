import { catalogByKey, GENERATED_PATH, IMDB_MATCH_REPORT_PATH, proposedCatalogRecord, readCatalog, readDrafts, writeJson } from "./catalog/catalog.js";
import { rateLimitedImdbSuggestions, readImdbTitleFacts } from "./catalog/imdb.js";
import { mergeImdbCandidates, savedImdbCandidate, selectImdbMatch } from "./catalog/imdb-matching.js";
import { isProgramBundle, titleAliases } from "./catalog/text.js";
import type { DraftFilm, ImdbCandidate, MatchFilm } from "./catalog/types.js";

interface PendingMatch {
  draft: DraftFilm;
  film: MatchFilm;
  saved?: ImdbCandidate;
  suggestions: ImdbCandidate[];
  errors: string[];
}

interface MatchReportEntry {
  nhKey: string;
  title: string;
  status: "matched" | "unresolved" | "skipped";
  imdbId?: string;
  reason?: string;
  candidates?: ImdbCandidate[];
  errors?: string[];
}

const rematch = process.argv.includes("--rematch");
const [drafts, catalog] = await Promise.all([readDrafts(), readCatalog()]);
const existingByKey = catalogByKey(catalog);
const pending: PendingMatch[] = [];
const report: MatchReportEntry[] = [];

for (const draft of drafts) {
  const film = matchFilmFromDraft(draft);
  if (!film) {
    report.push({ nhKey: draft.nhKey, title: draft.festivalTitle, status: "skipped", reason: "missing title or director metadata" });
    continue;
  }
  if (isProgramBundle(film)) {
    report.push({ nhKey: film.nhKey, title: film.festivalTitle, status: "skipped", reason: "program bundle or non-film event" });
    continue;
  }

  const existing = existingByKey.get(draft.nhKey);
  pending.push({
    draft,
    film,
    ...(existing?.imdbId && !rematch ? { saved: savedImdbCandidate(existing.imdbId, film) } : {}),
    suggestions: [],
    errors: []
  });
}

const savedIds = new Set(pending.flatMap((entry) => (entry.saved ? [entry.saved.id] : [])));
const savedFacts = await readFacts(savedIds, pending, "saved IMDb ID validation");
const unresolved = pending.filter((entry) => selectImdbMatch(entry.film, entry.saved, [], savedFacts, rematch).shouldQuerySuggestions);

for (const [index, entry] of unresolved.entries()) {
  console.log(`[${index + 1}/${unresolved.length}] Matching ${entry.film.nhKey}`);
  for (const query of titleAliases(entry.film)) {
    try {
      entry.suggestions.push(...(await rateLimitedImdbSuggestions(query)));
    } catch (error) {
      entry.errors.push(`IMDb suggestion for "${query}": ${errorMessage(error)}`);
    }
  }
}

const suggestionIds = new Set(unresolved.flatMap((entry) => entry.suggestions.map((candidate) => candidate.id)));
const suggestionFacts = await readFacts(suggestionIds, unresolved, "IMDb suggestion validation");
const facts = new Map([...savedFacts, ...suggestionFacts]);
const generated = [];

for (const entry of pending) {
  const candidates = mergeImdbCandidates([...(entry.saved ? [entry.saved] : []), ...entry.suggestions]);
  const result = selectImdbMatch(entry.film, entry.saved, candidates.filter((candidate) => !candidate.sources.includes("saved")), facts, rematch);
  if (!result.selected) {
    report.push({
      nhKey: entry.film.nhKey,
      title: entry.film.festivalTitle,
      status: "unresolved",
      reason: entry.errors[0] || "no acceptable IMDb movie match",
      candidates: result.candidates.slice(0, 5),
      ...(entry.errors.length ? { errors: entry.errors } : {})
    });
    continue;
  }

  generated.push(proposedCatalogRecord(entry.draft, existingByKey.get(entry.draft.nhKey), result.selected.id));
  report.push({
    nhKey: entry.film.nhKey,
    title: entry.film.festivalTitle,
    status: "matched",
    imdbId: result.selected.id,
    candidates: result.candidates.slice(0, 5),
    ...(entry.errors.length ? { errors: entry.errors } : {})
  });
}

generated.sort((left, right) => left.nhKey.localeCompare(right.nhKey));
report.sort((left, right) => left.nhKey.localeCompare(right.nhKey));
await writeJson(GENERATED_PATH, generated);
await writeJson(IMDB_MATCH_REPORT_PATH, {
  rematch,
  matched: report.filter((entry) => entry.status === "matched").length,
  unresolved: report.filter((entry) => entry.status === "unresolved").length,
  skipped: report.filter((entry) => entry.status === "skipped").length,
  results: report
});
console.log(`Matched ${generated.length}/${drafts.length} drafts; see ${GENERATED_PATH} and ${IMDB_MATCH_REPORT_PATH}`);

function matchFilmFromDraft(draft: DraftFilm): MatchFilm | undefined {
  const director = draft.director?.trim();
  const festivalTitle = draft.festivalTitle.trim();
  if (!director || !festivalTitle) return undefined;

  const film: MatchFilm = {
    nhKey: draft.nhKey,
    festivalTitle,
    director
  };
  if (draft.originalTitle?.trim()) film.originalTitle = draft.originalTitle.trim();
  if (draft.year !== undefined) film.year = draft.year;
  return film;
}

async function readFacts(ids: Set<string>, entries: PendingMatch[], label: string) {
  try {
    return await readImdbTitleFacts(ids);
  } catch (error) {
    const message = `${label}: ${errorMessage(error)}`;
    for (const entry of entries) entry.errors.push(message);
    return new Map();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
