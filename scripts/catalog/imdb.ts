import { load } from "cheerio";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { delay, FETCH_DELAY_MS, fetchWithRetry } from "./network.js";
import type { ImdbCandidate, ImdbDatasetRecord, ImdbTitleFacts } from "./types.js";

const IMDB_RATINGS_DATASET_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const IMDB_BASICS_DATASET_URL = "https://datasets.imdbws.com/title.basics.tsv.gz";
const IMDB_CREW_DATASET_URL = "https://datasets.imdbws.com/title.crew.tsv.gz";
const IMDB_NAMES_DATASET_URL = "https://datasets.imdbws.com/name.basics.tsv.gz";
const IMDB_GRAPHQL_URL = "https://api.graphql.imdb.com/";

export async function readImdbTitleFacts(imdbIds: Set<string>): Promise<Map<string, ImdbTitleFacts>> {
  const facts = new Map<string, ImdbTitleFacts>();
  if (!imdbIds.size) return facts;

  const directorIdsByTitle = new Map<string, string[]>();
  const directorIds = new Set<string>();

  console.log(`Reading IMDb basics dataset for ${imdbIds.size} candidate titles`);
  await scanImdbDataset(IMDB_BASICS_DATASET_URL, imdbIds, (id, columns, header) => {
    const title = ensureTitleFacts(facts, id);
    const primaryTitle = readTsvValue(columns, header, "primaryTitle");
    const originalTitle = readTsvValue(columns, header, "originalTitle");
    const titleType = readTsvValue(columns, header, "titleType");
    const year = parseInteger(readTsvValue(columns, header, "startYear"));
    const genre = formatGenres(readTsvValue(columns, header, "genres"));

    if (primaryTitle) title.primaryTitle = primaryTitle;
    if (originalTitle) title.originalTitle = originalTitle;
    if (titleType) title.titleType = titleType;
    if (year !== undefined) title.year = year;
    if (genre) title.genre = genre;
  });

  console.log(`Reading IMDb crew dataset for ${imdbIds.size} candidate titles`);
  await scanImdbDataset(IMDB_CREW_DATASET_URL, imdbIds, (id, columns, header) => {
    const rawDirectors = readTsvValue(columns, header, "directors");
    if (!rawDirectors) return;

    const ids = rawDirectors.split(",").map((value) => value.trim()).filter(Boolean);
    if (!ids.length) return;

    directorIdsByTitle.set(id, ids);
    for (const directorId of ids) directorIds.add(directorId);
  });

  if (!directorIds.size) return facts;

  const names = new Map<string, string>();
  console.log(`Reading IMDb names dataset for ${directorIds.size} directors`);
  await scanImdbDataset(IMDB_NAMES_DATASET_URL, directorIds, (id, columns, header) => {
    const name = readTsvValue(columns, header, "primaryName");
    if (name) names.set(id, name);
  });

  for (const [titleId, ids] of directorIdsByTitle) {
    const directors = ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
    if (directors.length) ensureTitleFacts(facts, titleId).directors = directors;
  }

  return facts;
}

export async function readImdbDatasetRecords(imdbIds: Set<string>): Promise<Map<string, ImdbDatasetRecord>> {
  const records = new Map<string, ImdbDatasetRecord>();
  if (!imdbIds.size) return records;

  const fetchedAt = new Date().toISOString();
  console.log(`Reading IMDb ratings dataset for ${imdbIds.size} titles`);
  await scanImdbDataset(IMDB_RATINGS_DATASET_URL, imdbIds, (id, columns, header) => {
    const rating = readTsvValue(columns, header, "averageRating");
    const votes = parseInteger(readTsvValue(columns, header, "numVotes"));
    const record = records.get(id) || { fetchedAt };
    if (rating) record.imdbRating = rating;
    if (votes !== undefined) record.imdbVotes = votes;
    records.set(id, record);
  });

  console.log(`Reading IMDb basics dataset for ${imdbIds.size} titles`);
  await scanImdbDataset(IMDB_BASICS_DATASET_URL, imdbIds, (id, columns, header) => {
    const genre = formatGenres(readTsvValue(columns, header, "genres"));
    if (!genre) return;

    const record = records.get(id) || { fetchedAt };
    record.genre = genre;
    records.set(id, record);
  });

  return records;
}

async function imdbSuggestions(query: string): Promise<ImdbCandidate[]> {
  const path = imdbSuggestionPath(query);
  const url = `https://v2.sg.media-imdb.com/suggestion/${path[0]?.toLowerCase() || "x"}/${path}.json`;
  const response = await fetchWithRetry(url);
  if (!response.ok) return [];

  const payload = (await response.json()) as {
    d?: Array<{ id?: string; l?: string; y?: number; qid?: string; q?: string; rank?: number; s?: string }>;
  };

  return (payload.d || [])
    .filter((item) => item.id?.startsWith("tt") && item.l)
    .map((item) => {
      const candidate: ImdbCandidate = {
        id: item.id as string,
        title: item.l as string,
        query,
        sources: ["suggestion"],
        score: 0,
        validation: []
      };
      if (item.y !== undefined) candidate.year = item.y;
      const titleType = item.qid || item.q;
      if (titleType) candidate.titleType = titleType;
      if (item.rank !== undefined) candidate.rank = item.rank;
      if (item.s) candidate.credit = item.s;
      return candidate;
    });
}

export async function fetchImdbDescription(imdbId: string): Promise<string | undefined> {
  const response = await fetchWithRetry(`https://www.imdb.com/title/${imdbId}/`);
  if (response.ok) {
    const description = extractImdbDescription(await response.text());
    if (description) return description;
  } else if (response.status !== 202) {
    throw new Error(`IMDb title ${imdbId} returned HTTP ${response.status}`);
  }

  return fetchImdbGraphqlDescription(imdbId);
}

export function extractImdbDescription(html: string): string | undefined {
  const $ = load(html);
  const content = $("meta[property='og:description'], meta[name='description']")
    .map((_, element) => $(element).attr("content")?.replace(/\s+/g, " ").trim())
    .get()
    .find(Boolean);
  return content || undefined;
}

export function extractImdbGraphqlDescription(payload: unknown): string | undefined {
  const value = payload as {
    data?: { title?: { plot?: { plotText?: { plainText?: unknown } } } };
  };
  const description = value.data?.title?.plot?.plotText?.plainText;
  return typeof description === "string" && description.trim() ? description.replace(/\s+/g, " ").trim() : undefined;
}

export async function rateLimitedImdbSuggestions(query: string): Promise<ImdbCandidate[]> {
  await delay(FETCH_DELAY_MS);
  return imdbSuggestions(query);
}

async function fetchImdbGraphqlDescription(imdbId: string): Promise<string | undefined> {
  const response = await fetchWithRetry(IMDB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.imdb.com"
    },
    body: JSON.stringify({
      query: "query TitlePlot($id: ID!) { title(id: $id) { plot { plotText { plainText } } } }",
      variables: { id: imdbId }
    })
  });
  if (!response.ok) throw new Error(`IMDb GraphQL title ${imdbId} returned HTTP ${response.status}`);
  return extractImdbGraphqlDescription(await response.json());
}

function ensureTitleFacts(facts: Map<string, ImdbTitleFacts>, id: string): ImdbTitleFacts {
  const existing = facts.get(id);
  if (existing) return existing;

  const title: ImdbTitleFacts = { id };
  facts.set(id, title);
  return title;
}

async function scanImdbDataset(
  url: string,
  imdbIds: Set<string>,
  handleRow: (id: string, columns: string[], header: Map<string, number>) => void
): Promise<void> {
  const response = await fetchWithRetry(url);
  if (!response.ok || !response.body) throw new Error(`${url} returned HTTP ${response.status}`);

  const input = Readable.fromWeb(response.body as never).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  const seen = new Set<string>();
  let header: Map<string, number> | undefined;

  for await (const line of lines) {
    if (!header) {
      header = new Map(line.split("\t").map((column, index) => [column, index]));
      continue;
    }

    const id = line.slice(0, line.indexOf("\t"));
    if (!imdbIds.has(id)) continue;
    handleRow(id, line.split("\t"), header);
    seen.add(id);
    if (seen.size === imdbIds.size) break;
  }

  lines.close();
}

function readTsvValue(columns: string[], header: Map<string, number>, column: string): string | undefined {
  const index = header.get(column);
  if (index === undefined) return undefined;

  const value = columns[index]?.trim();
  return value && value !== "\\N" ? value : undefined;
}

function parseInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatGenres(value: string | undefined): string | undefined {
  return value?.replace(/,/g, ", ");
}

function imdbSuggestionPath(query: string): string {
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
