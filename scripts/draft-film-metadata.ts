import { readFile, writeFile } from "node:fs/promises";
import { load } from "cheerio";
import type { NhFilmKey } from "@nowsze-horyzonty/shared";

const BASE_URL = "https://www.nowehoryzonty.pl";

interface DiscoveredFilm {
  nhKey: NhFilmKey;
  title: string;
  detailUrl: string;
}

interface DraftRecord {
  active: false;
  nhKey: NhFilmKey;
  festivalTitle: string;
  originalTitle?: string;
  director?: string;
  year?: number;
  imdbCandidates: ImdbCandidate[];
  noweHoryzontyUrl: string;
  trailerCandidates: string[];
  summaryPl: string;
  rawSourcesPrivate: {
    noweHoryzontyDescription?: string;
    fetchedAt: string;
  };
}

interface ImdbCandidate {
  imdbId: string;
  title: string;
  year?: string;
  type?: string;
}

const inputPath = process.argv[2] || "data/films.discovered.json";
const outputPath = process.argv[3] || "data/films.draft.json";
const discovered = JSON.parse(await readFile(inputPath, "utf8")) as DiscoveredFilm[];
const drafts: DraftRecord[] = [];

for (const film of discovered) {
  console.log(`Drafting ${film.nhKey}`);
  const page = await scrapeFilmPage(film.detailUrl);

  const draft: DraftRecord = {
    active: false,
    nhKey: film.nhKey,
    festivalTitle: page.festivalTitle || film.title,
    imdbCandidates: [],
    noweHoryzontyUrl: film.detailUrl,
    trailerCandidates: page.trailerCandidates,
    summaryPl: "",
    rawSourcesPrivate: {
      fetchedAt: new Date().toISOString()
    }
  };

  if (page.originalTitle) draft.originalTitle = page.originalTitle;
  if (page.director) draft.director = page.director;
  if (page.year !== undefined) draft.year = page.year;
  if (page.description) draft.rawSourcesPrivate.noweHoryzontyDescription = page.description;

  drafts.push(draft);
}

await writeFile(outputPath, `${JSON.stringify(drafts, null, 2)}\n`);
console.log(`Wrote ${drafts.length} draft records to ${outputPath}`);

async function scrapeFilmPage(url: string): Promise<{
  festivalTitle: string;
  originalTitle?: string;
  director?: string;
  year?: number;
  description?: string;
  trailerCandidates: string[];
}> {
  const html = await fetchText(url);
  const $ = load(html);
  const productionLine = $(".czolowka .nag").first().text().replace(/\s+/g, " ").trim();
  const yearMatch = productionLine.match(/\b(20\d{2})\b/);

  const page: {
    festivalTitle: string;
    originalTitle?: string;
    director?: string;
    year?: number;
    description?: string;
    trailerCandidates: string[];
  } = {
    festivalTitle: $("h1").first().text().trim(),
    trailerCandidates: trailerUrls($)
  };
  const originalTitle = textOrUndefined($(".tytulorg.nag").first().text());
  const director = textOrUndefined($(".f6.rez").first().text());
  const description = textOrUndefined($(".tresc.glownyop").first().text().replace(/\s+/g, " ").trim());

  if (originalTitle) page.originalTitle = originalTitle;
  if (director) page.director = director;
  if (yearMatch?.[1]) page.year = Number.parseInt(yearMatch[1], 10);
  if (description) page.description = description;

  return page;
}

function trailerUrls($: ReturnType<typeof load>): string[] {
  const urls = new Set<string>();
  $(".objerzyjzwiast").each((_, element) => {
    const type = $(element).attr("data-video-typ");
    const link = $(element).attr("data-video-link");
    if (!type || !link) return;

    if (type === "youtube") urls.add(`https://www.youtube.com/watch?v=${link}`);
    if (type === "vimeo") urls.add(`https://vimeo.com/${link}`);
    if (/^https?:\/\//.test(link)) urls.add(link);
  });
  return [...urls];
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

function textOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}
