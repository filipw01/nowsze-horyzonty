import { delay, FETCH_DELAY_MS, fetchWithRetry } from "./network.js";
import { normalizeTitle, titleAliases } from "./text.js";
import type { MatchFilm, MetacriticCandidate, MetacriticMatch } from "./types.js";

const METACRITIC_BASE_URL = "https://www.metacritic.com";
const METACRITIC_BACKEND_URL = "https://backend.metacritic.com";
const ACCEPTANCE_THRESHOLD = 70;

export async function findMetacriticMatch(film: MatchFilm): Promise<MetacriticMatch | undefined> {
  const candidates = await findMetacriticCandidates(film);
  const best = candidates[0];
  if (!best || best.confidence < ACCEPTANCE_THRESHOLD || best.metascore === undefined) return undefined;

  const details = await readMetacriticStats(best).catch(() => undefined);
  const metascore = details?.metascore ?? best.metascore;
  if (metascore === undefined) return undefined;

  return {
    metascore,
    metacriticUrl: details?.metacriticUrl ?? metacriticPageUrl(best),
    ...(details?.criticsReviewCount !== undefined ? { criticsReviewCount: details.criticsReviewCount } : {}),
    fetchedAt: new Date().toISOString(),
    candidate: best
  };
}

function scoreMetacriticCandidate(
  film: MatchFilm,
  candidate: Omit<MetacriticCandidate, "query" | "confidence">,
  query: string
): MetacriticCandidate {
  const aliases = titleAliases(film).map(normalizeTitle).filter(Boolean);
  const title = normalizeTitle(candidate.title);
  const normalizedQuery = normalizeTitle(query);
  let confidence = 0;

  if (aliases.includes(title)) confidence += 70;
  else if (aliases.some((alias) => alias && (title.includes(alias) || alias.includes(title)))) confidence += 24;
  if (title === normalizedQuery) confidence += 8;
  if (candidate.year && film.year && candidate.year === film.year) confidence += 22;
  if (candidate.year && film.year && Math.abs(candidate.year - film.year) === 1) confidence += 8;
  if (candidate.year && film.year && Math.abs(candidate.year - film.year) > 1) confidence -= 25;
  if (candidate.metascore !== undefined) confidence += 10;
  if (/\b(director s cut|remaster|remastered|restored|collection)\b/.test(title) && !aliases.includes(title)) confidence -= 20;

  return { ...candidate, query, confidence };
}

async function findMetacriticCandidates(film: MatchFilm): Promise<MetacriticCandidate[]> {
  const bySlug = new Map<string, MetacriticCandidate>();

  for (const query of titleAliases(film).slice(0, 3)) {
    await delay(FETCH_DELAY_MS);
    for (const candidate of await metacriticSearch(query)) {
      const scored = scoreMetacriticCandidate(film, candidate, query);
      const current = bySlug.get(scored.slug);
      if (!current || scored.confidence > current.confidence) bySlug.set(scored.slug, scored);
    }
  }

  return [...bySlug.values()].sort((left, right) => right.confidence - left.confidence);
}

async function metacriticSearch(query: string): Promise<Omit<MetacriticCandidate, "query" | "confidence">[]> {
  const url = new URL(`/finder/metacritic/search/${encodeURIComponent(query)}/web`, METACRITIC_BACKEND_URL);
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", "10");
  url.searchParams.set("mcoTypeId", "2");
  url.searchParams.set("componentName", "search");
  url.searchParams.set("componentDisplayName", "Search");
  url.searchParams.set("componentType", "SearchResults");

  const response = await fetchWithRetry(url.href).catch(() => null);
  if (!response?.ok) return [];

  const payload = (await response.json()) as {
    data?: {
      items?: Array<{
        title?: string;
        slug?: string;
        premiereYear?: number;
        criticScoreSummary?: { score?: number | null; url?: string | null };
      }>;
    };
  };

  return (payload.data?.items || [])
    .filter((item) => item.title && item.slug)
    .map((item) => {
      const candidate: Omit<MetacriticCandidate, "query" | "confidence"> = {
        title: item.title as string,
        slug: item.slug as string
      };
      if (item.premiereYear !== undefined) candidate.year = item.premiereYear;
      const metascore = parseMetascore(item.criticScoreSummary?.score);
      if (metascore !== undefined) candidate.metascore = metascore;
      if (item.criticScoreSummary?.url) candidate.criticReviewsUrl = item.criticScoreSummary.url;
      return candidate;
    });
}

async function readMetacriticStats(candidate: MetacriticCandidate): Promise<{
  metascore?: number;
  metacriticUrl?: string;
  criticsReviewCount?: number;
}> {
  const url = new URL(`/reviews/metacritic/critic/movies/${candidate.slug}/stats/web`, METACRITIC_BACKEND_URL);
  url.searchParams.set("componentName", "critic-score-summary");
  url.searchParams.set("componentDisplayName", "Critic Score Summary");
  url.searchParams.set("componentType", "MetaScoreSummary");
  const response = await fetchWithRetry(url.href);
  if (!response.ok) return {};

  const payload = (await response.json()) as {
    data?: { item?: { score?: number | null; reviewCount?: number | null; url?: string | null } };
  };
  const item = payload.data?.item;
  const metascore = parseMetascore(item?.score);
  return {
    ...(metascore !== undefined ? { metascore } : {}),
    ...(typeof item?.reviewCount === "number" ? { criticsReviewCount: item.reviewCount } : {}),
    ...(item?.url ? { metacriticUrl: absoluteMetacriticUrl(item.url) } : {})
  };
}

function metacriticPageUrl(candidate: MetacriticCandidate): string {
  return absoluteMetacriticUrl(candidate.criticReviewsUrl || `/movie/${candidate.slug}/critic-reviews/`);
}

function absoluteMetacriticUrl(path: string): string {
  return new URL(path, METACRITIC_BASE_URL).href;
}

function parseMetascore(value: number | null | undefined): number | undefined {
  return typeof value === "number" && value >= 0 && value <= 100 ? value : undefined;
}
