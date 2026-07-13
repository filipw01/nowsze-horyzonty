import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import type { NhFilmKey } from "@nowsze-horyzonty/shared";

const BASE_URL = "https://www.nowehoryzonty.pl";
const INPUT_PATH = "data/films.draft.json";
const OUTPUT_PATH = "data/films.generated.json";
const REPORT_PATH = "data/films.generation-report.json";
const EXISTING_PATH = "data/films.json";
const FETCH_DELAY_MS = 200;
const IMDB_RATINGS_DATASET_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const IMDB_BASICS_DATASET_URL = "https://datasets.imdbws.com/title.basics.tsv.gz";
const IMDB_OVERRIDES: Record<NhFilmKey, string> = {
  "/program/26/dziewczyna": "tt0062931",
  "/program/26/krwiozercza-roslina-wersja-rezyserska": "tt0091419",
  "/program/26/mongolska-joanna-darc": "tt0095406",
  "/program/26/sny-o-milosci": "tt30810787",
  "/program/26/za-zwyciestwo": "tt37661902"
};
const SUMMARY_OVERRIDES: Record<NhFilmKey, string> = {
  "/program/26/egzamin-wstepny":
    "Elitarna szkoła filmowa otwiera rekrutacyjne drzwi, a za nimi widać marzenia, stres i bezlitosne pytanie, kto naprawdę dostaje szansę na kino."
};

interface DraftFilm {
  nhKey: NhFilmKey;
  festivalTitle: string;
  originalTitle?: string;
  director?: string;
  year?: number;
  noweHoryzontyUrl: string;
  trailerCandidates?: string[];
  rawSourcesPrivate?: {
    noweHoryzontyDescription?: string;
  };
}

interface ExistingRecord {
  nhKey: NhFilmKey;
  summaryPl?: string;
  imdbRating?: string;
  imdbVotes?: number;
  imdbDataFetchedAt?: string;
  genre?: string;
  metascore?: number;
}

interface FilmPage {
  nhKey: NhFilmKey;
  festivalTitle: string;
  originalTitle?: string;
  director: string;
  year?: number;
  description: string;
  trailerCandidates: string[];
  noweHoryzontyUrl: string;
}

interface ImdbCandidate {
  id: string;
  title: string;
  year?: number;
  qid?: string;
  rank?: number;
  credit?: string;
  query: string;
  score: number;
}

interface GeneratedRecord {
  active: true;
  nhKey: NhFilmKey;
  festivalTitle: string;
  originalTitle?: string;
  imdbId: string;
  noweHoryzontyUrl: string;
  imdbUrl: string;
  imdbRating?: string;
  imdbVotes?: number;
  imdbDataFetchedAt?: string;
  genre?: string;
  metascore?: number;
  trailerCandidates?: string[];
  summaryPl: string;
  rawSourcesPrivate: {
    noweHoryzontyDescription: string;
    fetchedAt: string;
  };
}

interface ImdbDatasetRecord {
  imdbRating?: string;
  imdbVotes?: number;
  genre?: string;
  fetchedAt: string;
}

interface ReportEntry {
  nhKey: NhFilmKey;
  title: string;
  reason?: string;
  candidate?: ImdbCandidate;
  alternatives?: ImdbCandidate[];
}

const drafts = JSON.parse(await readFile(INPUT_PATH, "utf8")) as DraftFilm[];
const existingSummaries = await readExistingSummaries();
const existingStaticData = await readExistingStaticData();
const knownImdbIds = await readKnownImdbIds();
const generated: GeneratedRecord[] = [];
const skipped: ReportEntry[] = [];
const lowConfidence: ReportEntry[] = [];

for (const [index, draft] of drafts.entries()) {
  console.log(`[${index + 1}/${drafts.length}] ${draft.nhKey}`);
  await delay(FETCH_DELAY_MS);

  const page = filmPageFromDraft(draft);
  if (!page) skipped.push({ nhKey: draft.nhKey, title: draft.festivalTitle, reason: "missing film metadata" });
  if (!page) continue;

  if (isProgramBundle(page)) {
    skipped.push({ nhKey: page.nhKey, title: page.festivalTitle, reason: "program bundle or non-film event" });
    continue;
  }

  const candidates = await findImdbCandidates(page);
  const best = candidates[0];
  if (!best || best.score < 70) {
    const entry: ReportEntry = {
      nhKey: page.nhKey,
      title: page.festivalTitle,
      reason: "no high-confidence IMDb movie match",
      alternatives: candidates.slice(0, 5)
    };
    if (best) entry.candidate = best;
    lowConfidence.push(entry);
    continue;
  }

  const record: GeneratedRecord = {
    active: true,
    nhKey: page.nhKey,
    festivalTitle: page.festivalTitle,
    imdbId: best.id,
    noweHoryzontyUrl: page.noweHoryzontyUrl,
    imdbUrl: `https://www.imdb.com/title/${best.id}/`,
    summaryPl: SUMMARY_OVERRIDES[page.nhKey] || existingSummaries.get(page.nhKey) || summarize(page),
    rawSourcesPrivate: {
      noweHoryzontyDescription: page.description,
      fetchedAt: new Date().toISOString()
    }
  };

  if (page.originalTitle) record.originalTitle = page.originalTitle;
  if (page.trailerCandidates.length) record.trailerCandidates = page.trailerCandidates;
  generated.push(record);
}

const imdbDatasetData = await readImdbDatasetData(new Set(generated.map((record) => record.imdbId)));
for (const record of generated) {
  applyStaticImdbData(record, imdbDatasetData.get(record.imdbId) || existingStaticData.get(record.nhKey));
}

generated.sort((left, right) => left.nhKey.localeCompare(right.nhKey));
await writeFile(OUTPUT_PATH, `${JSON.stringify(generated, null, 2)}\n`);
await writeFile(
  REPORT_PATH,
  `${JSON.stringify({ generated: generated.length, imdbDataset: imdbDatasetStats(generated), skipped, lowConfidence }, null, 2)}\n`
);
console.log(`Generated ${generated.length} records in ${OUTPUT_PATH}`);
console.log(`Skipped ${skipped.length}, low-confidence ${lowConfidence.length}; see ${REPORT_PATH}`);

async function readExistingSummaries(): Promise<Map<NhFilmKey, string>> {
  try {
    const records = JSON.parse(await readFile(EXISTING_PATH, "utf8")) as ExistingRecord[];
    return new Map(records.flatMap((record) => (record.summaryPl ? [[record.nhKey, record.summaryPl]] : [])));
  } catch {
    return new Map();
  }
}

async function readExistingStaticData(): Promise<Map<NhFilmKey, ImdbDatasetRecord>> {
  try {
    const records = JSON.parse(await readFile(EXISTING_PATH, "utf8")) as ExistingRecord[];
    return new Map(
      records.flatMap((record) => {
        const data: ImdbDatasetRecord = {
          fetchedAt: record.imdbDataFetchedAt || new Date(0).toISOString()
        };
        if (record.imdbRating) data.imdbRating = record.imdbRating;
        if (record.imdbVotes !== undefined) data.imdbVotes = record.imdbVotes;
        if (record.genre) data.genre = record.genre;
        return data.imdbRating || data.imdbVotes !== undefined || data.genre ? [[record.nhKey, data]] : [];
      })
    );
  } catch {
    return new Map();
  }
}

async function readKnownImdbIds(): Promise<Map<NhFilmKey, string>> {
  try {
    const records = JSON.parse(await readFile(OUTPUT_PATH, "utf8")) as Array<{ nhKey: NhFilmKey; imdbId?: string }>;
    return new Map(records.flatMap((record) => (record.imdbId ? [[record.nhKey, record.imdbId]] : [])));
  } catch {
    return new Map();
  }
}

async function readImdbDatasetData(imdbIds: Set<string>): Promise<Map<string, ImdbDatasetRecord>> {
  const fetchedAt = new Date().toISOString();
  const records = new Map<string, ImdbDatasetRecord>();

  if (!imdbIds.size) return records;

  console.log(`Reading IMDb ratings dataset for ${imdbIds.size} titles`);
  await scanImdbDataset(IMDB_RATINGS_DATASET_URL, imdbIds, (imdbId, columns, header) => {
    const imdbRating = readTsvValue(columns, header, "averageRating");
    const imdbVotes = parsePositiveInteger(readTsvValue(columns, header, "numVotes"));
    const record = records.get(imdbId) || { fetchedAt };
    if (imdbRating) record.imdbRating = imdbRating;
    if (imdbVotes !== undefined) record.imdbVotes = imdbVotes;
    records.set(imdbId, record);
  });

  console.log(`Reading IMDb basics dataset for ${imdbIds.size} titles`);
  await scanImdbDataset(IMDB_BASICS_DATASET_URL, imdbIds, (imdbId, columns, header) => {
    const genre = formatGenres(readTsvValue(columns, header, "genres"));
    if (!genre) return;

    const record = records.get(imdbId) || { fetchedAt };
    record.genre = genre;
    records.set(imdbId, record);
  });

  return records;
}

async function scanImdbDataset(
  url: string,
  imdbIds: Set<string>,
  handleRow: (imdbId: string, columns: string[], header: Map<string, number>) => void
): Promise<void> {
  const response = await fetchWithRetry(url);
  if (!response.ok || !response.body) throw new Error(`${url} returned HTTP ${response.status}`);

  const input = Readable.fromWeb(response.body as never).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  const seen = new Set<string>();
  let header: Map<string, number> | null = null;

  for await (const line of lines) {
    if (!header) {
      header = new Map(line.split("\t").map((column, index) => [column, index]));
      continue;
    }

    const imdbId = line.slice(0, line.indexOf("\t"));
    if (!imdbIds.has(imdbId)) continue;

    handleRow(imdbId, line.split("\t"), header);
    seen.add(imdbId);
    if (seen.size === imdbIds.size) break;
  }

  lines.close();
}

function readTsvValue(columns: string[], header: Map<string, number>, columnName: string): string | undefined {
  const index = header.get(columnName);
  if (index === undefined) return undefined;

  const value = columns[index]?.trim();
  return value && value !== "\\N" ? value : undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatGenres(value: string | undefined): string | undefined {
  return value?.replace(/,/g, ", ");
}

function applyStaticImdbData(record: GeneratedRecord, data: ImdbDatasetRecord | undefined): void {
  if (!data) return;

  if (data.imdbRating) record.imdbRating = data.imdbRating;
  if (data.imdbVotes !== undefined) record.imdbVotes = data.imdbVotes;
  if (data.genre) record.genre = data.genre;
  if (data.imdbRating || data.imdbVotes !== undefined || data.genre) record.imdbDataFetchedAt = data.fetchedAt;
}

function imdbDatasetStats(records: GeneratedRecord[]): {
  withRating: number;
  withVotes: number;
  withGenre: number;
  missingRating: NhFilmKey[];
} {
  return {
    withRating: records.filter((record) => record.imdbRating).length,
    withVotes: records.filter((record) => record.imdbVotes !== undefined).length,
    withGenre: records.filter((record) => record.genre).length,
    missingRating: records.filter((record) => !record.imdbRating).map((record) => record.nhKey)
  };
}

function filmPageFromDraft(draft: DraftFilm): FilmPage | null {
  const description = draft.rawSourcesPrivate?.noweHoryzontyDescription?.trim();
  if (!draft.festivalTitle || !draft.director || !description) return null;

  const page: FilmPage = {
    nhKey: draft.nhKey,
    festivalTitle: draft.festivalTitle,
    director: draft.director,
    noweHoryzontyUrl: draft.noweHoryzontyUrl || new URL(draft.nhKey, BASE_URL).href,
    description,
    trailerCandidates: draft.trailerCandidates || []
  };

  if (draft.originalTitle && draft.originalTitle !== draft.festivalTitle) page.originalTitle = draft.originalTitle;
  if (draft.year !== undefined) page.year = draft.year;
  return page;
}

function isProgramBundle(page: FilmPage): boolean {
  const key = page.nhKey.toLowerCase();
  const title = page.festivalTitle.toLowerCase();
  return (
    key.includes("zestaw") ||
    title.includes("zestaw") ||
    title.includes("netflix:") ||
    title.includes("sezon ") ||
    title.includes("pokaz laureata") ||
    title.includes("seans niespodzianka")
  );
}

async function findImdbCandidates(page: FilmPage): Promise<ImdbCandidate[]> {
  const override = IMDB_OVERRIDES[page.nhKey] || knownImdbIds.get(page.nhKey);
  if (override) {
    const candidate: ImdbCandidate = {
      id: override,
      title: page.originalTitle || page.festivalTitle,
      qid: "movie",
      query: "manual override",
      score: 999
    };
    if (page.year !== undefined) candidate.year = page.year;
    return [
      candidate
    ];
  }

  const queries = titleQueries(page);
  const byId = new Map<string, ImdbCandidate>();

  for (const query of queries) {
    await delay(FETCH_DELAY_MS);
    const candidates = await imdbSuggest(query);
    for (const candidate of candidates) {
      const scored = scoreCandidate(page, candidate, query);
      const existing = byId.get(scored.id);
      if (!existing || scored.score > existing.score) byId.set(scored.id, scored);
    }
  }

  return [...byId.values()].sort((left, right) => right.score - left.score || (left.rank ?? 999_999) - (right.rank ?? 999_999));
}

function titleQueries(page: FilmPage): string[] {
  const titles = [page.originalTitle, page.festivalTitle].flatMap((value) => splitTitle(value || ""));
  return [...new Set(titles.map((value) => value.replace(/\s+/g, " ").trim()).filter((value) => value.length >= 2))].slice(0, 6);
}

function splitTitle(value: string): string[] {
  const withoutParenthetical = value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const parts = [value, withoutParenthetical].flatMap((title) => title.split(/\s+\/\s+|: /).map((part) => part.trim()));
  return [value, ...parts];
}

async function imdbSuggest(query: string): Promise<Omit<ImdbCandidate, "query" | "score">[]> {
  const path = imdbSuggestPath(query);
  const url = `https://v2.sg.media-imdb.com/suggestion/${path[0]?.toLowerCase() || "x"}/${path}.json`;
  const response = await fetchWithRetry(url).catch(() => null);
  if (!response) return [];
  if (!response.ok) return [];

  const payload = (await response.json()) as {
    d?: Array<{ id?: string; l?: string; y?: number; qid?: string; q?: string; rank?: number; s?: string }>;
  };
  return (payload.d || [])
    .filter((item) => item.id?.startsWith("tt") && item.l)
    .map((item) => {
      const candidate: Omit<ImdbCandidate, "query" | "score"> = {
        id: item.id as string,
        title: item.l as string
      };
      if (item.y !== undefined) candidate.year = item.y;
      const qid = item.qid || item.q;
      if (qid) candidate.qid = qid;
      if (item.rank !== undefined) candidate.rank = item.rank;
      if (item.s) candidate.credit = item.s;
      return candidate;
    });
}

function imdbSuggestPath(query: string): string {
  const ascii = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, (letter) => (letter === "Ł" ? "L" : "l"))
    .replace(/[øØ]/g, (letter) => (letter === "Ø" ? "O" : "o"))
    .replace(/[đĐ]/g, (letter) => (letter === "Đ" ? "D" : "d"))
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
  return encodeURIComponent(ascii || query).replace(/%20/g, "_");
}

function scoreCandidate(page: FilmPage, candidate: Omit<ImdbCandidate, "query" | "score">, query: string): ImdbCandidate {
  const aliases = titleQueries(page).map(normalizeTitle);
  const candidateTitle = normalizeTitle(candidate.title);
  let score = 0;

  if (aliases.includes(candidateTitle)) score += 62;
  if (aliases.some((alias) => alias && (candidateTitle.includes(alias) || alias.includes(candidateTitle)))) score += 24;
  if (candidate.year && page.year && candidate.year === page.year) score += 24;
  if (candidate.year && page.year && Math.abs(candidate.year - page.year) === 1) score += 8;
  if (["movie", "short", "tvMovie", "video"].includes(candidate.qid || "")) score += 16;
  if (candidate.qid && !["movie", "short", "tvMovie", "video"].includes(candidate.qid)) score -= 35;
  if (candidate.credit && page.director.split(",").some((name) => candidate.credit?.toLowerCase().includes(name.trim().toLowerCase()))) score += 18;
  if (candidate.rank && candidate.rank < 20_000) score += 4;

  return { ...candidate, query, score };
}

function summarize(page: FilmPage): string {
  const sentences = splitDescription(page.description);
  const useful = sentences
    .map((sentence) => ({ sentence, score: summaryScore(sentence) }))
    .sort((left, right) => right.score - left.score)[0]?.sentence || sentences[0] || page.description;
  return makeOneSentence(casualize(useful), page.festivalTitle);
}

function splitDescription(description: string): string[] {
  const protectedText = description
    .replace(/\bm\.in\./gi, "między innymi")
    .replace(/\bnp\./gi, "na przykład")
    .replace(/\b(\d+)\.\s*NH\b/g, "$1 NH")
    .replace(/\s+/g, " ");
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45);
}

function summaryScore(sentence: string): number {
  let score = 0;
  if (/bohater|bohaterka|rodzin|matk|ojc|cór|syn|siostr|brat|kobiet|mężczyzn|dziewczyn|chłop|dzieck|artyst|para|przyjac|Seymour|Johanne|Donnie/i.test(sentence)) score += 35;
  if (/wyrusza|wraca|próbuje|musi|trafia|poznaje|odkrywa|szuka|walczy|ucieka|zostaje|żyje|pracuje|planuje|marzy|dochodzi|wpada|ratuje|zaczyna|staje/i.test(sentence)) score += 30;
  if (/gdy|kiedy|aż|po tym jak|pewnego dnia|wszystko zmienia|szybko wychodzi na jaw/i.test(sentence)) score += 18;
  if (/miłoś|śmier|sekret|konflikt|kryzys|traum|zemst|tajemnic|wypraw|podróż|rodzin|przemoc|wojn|katastrof|duch|potwór|sny|rzeczywistości|świat skończy/i.test(sentence)) score += 18;
  if (sentence.length >= 70 && sentence.length <= 260) score += 10;
  if (/Nowych Horyzont|program|sekcj|festiwal|retrospektyw|premier|laureat|nagrod|pokazywan|Cannes|Berlinale|MFF|NH\)|\b\d+\s+NH\b|histori[ai] kina|w swoim najnowszym filmie|pełnometrażowy debiut|reżyser|twórcz|dokumenty Fredericka Wisemana|film (?:jest|należy|otrzymał)/i.test(sentence)) score -= 65;
  if (/^\W|^(Choć|Poza tym|Był rok|Przyglądając się|Kamera|Reżyser|Dokumenty|Pełen|Liryczna|Niemiecki film|Jedyny w swoim rodzaju|W domu|W szkole)/i.test(sentence)) score -= 25;
  if (sentence.includes("...")) score -= 60;
  return score;
}

function casualize(value: string): string {
  return value
    .replace(/^Nagrodzony[^.]+\.?\s*/i, "")
    .replace(/^Najnowszy film [^.]+ to /i, "To ")
    .replace(/^Film opowiada o /i, "To historia o ")
    .replace(/^To opowieść o /i, "To historia o ")
    .replace(/^Bohaterami? (?:filmu|opowieści) (?:są|jest) /i, "")
    .replace(/^Główną bohaterką (?:filmu|opowieści) jest /i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeOneSentence(value: string, title: string): string {
  const withoutTrailing = value.replace(/[.!?]+$/, "");
  const shortened = withoutTrailing.length <= 320 ? withoutTrailing : withoutTrailing.slice(0, 320).replace(/[,;:]?\s+\S*$/, "");
  const result = shortened || `${title} wymyka się prostemu opisowi`;
  return `${result}.`;
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, (letter) => (letter === "Ł" ? "L" : "l"))
    .replace(/[øØ]/g, (letter) => (letter === "Ø" ? "O" : "o"))
    .replace(/[đĐ]/g, (letter) => (letter === "Đ" ? "D" : "d"))
    .replace(/['’`]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\b(the|a|an|le|la|les|el|los|las)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Connection: "close"
        }
      });
      if (response.ok || (response.status >= 400 && response.status < 500)) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(FETCH_DELAY_MS * attempt * 3);
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
