import { hasCreditDirectorMatch, hasDirectorMatch, normalizeTitle, titleAliases } from "./text.js";
import type { ImdbCandidate, ImdbTitleFacts, MatchFilm } from "./types.js";

const ACCEPTANCE_THRESHOLD = 72;

interface MatchSelection {
  selected?: ImdbCandidate;
  candidates: ImdbCandidate[];
  shouldQuerySuggestions: boolean;
}

export function savedImdbCandidate(id: string, film: MatchFilm, query = "saved catalog id"): ImdbCandidate {
  return {
    id,
    title: film.originalTitle || film.festivalTitle,
    query,
    sources: ["saved"],
    score: 0,
    validation: []
  };
}

export function scoreImdbCandidate(film: MatchFilm, candidate: ImdbCandidate, facts: ImdbTitleFacts | undefined): ImdbCandidate {
  const validation: string[] = [];
  let score = 0;
  let blockingMismatch = false;
  let directorMatched = false;
  const aliases = titleAliases(film).map(normalizeTitle).filter(Boolean);
  const candidateTitles = facts
    ? [facts.primaryTitle, facts.originalTitle].map((title) => normalizeTitle(title || "")).filter(Boolean)
    : candidate.sources.includes("saved")
      ? []
      : [normalizeTitle(candidate.title)].filter(Boolean);
  const exactTitleMatch = candidateTitles.some((title) => aliases.includes(title));
  const partialTitleMatch = candidateTitles.some((title) => aliases.some((alias) => alias && (title.includes(alias) || alias.includes(title))));

  if (exactTitleMatch) score += 60;
  else if (partialTitleMatch) score += 26;
  else {
    score -= 55;
    blockingMismatch = true;
    validation.push(facts ? "title mismatch" : "IMDb title facts unavailable");
  }

  const year = facts?.year ?? candidate.year;
  if (film.year !== undefined && year !== undefined) {
    const delta = Math.abs(film.year - year);
    if (delta === 0) score += 28;
    else if (delta === 1) {
      score += 10;
      validation.push(`near year match: NH ${film.year}, IMDb ${year}`);
    } else {
      score -= 80;
      blockingMismatch = true;
      validation.push(`year mismatch: NH ${film.year}, IMDb ${year}`);
    }
  } else if (film.year !== undefined) {
    validation.push("IMDb year unavailable");
  }

  const titleType = facts?.titleType || candidate.titleType;
  if (isMovieTitleType(titleType)) score += 12;
  else if (titleType) {
    score -= 60;
    blockingMismatch = true;
    validation.push(`non-film IMDb type: ${titleType}`);
  } else {
    validation.push("IMDb title type unavailable");
  }

  if (facts?.directors?.length) {
    directorMatched = hasDirectorMatch(film.director, facts.directors);
    if (directorMatched) score += 36;
    else {
      score -= 80;
      blockingMismatch = true;
      validation.push(`director mismatch: NH ${film.director}, IMDb ${facts.directors.join(", ")}`);
    }
  } else if (candidate.credit && hasCreditDirectorMatch(film.director, candidate.credit)) {
    directorMatched = true;
    score += 14;
    validation.push("director matched from IMDb suggestion credit");
  } else {
    validation.push("IMDb director facts unavailable");
  }

  if (candidate.sources.includes("suggestion") && candidate.rank !== undefined && candidate.rank < 20_000) score += 4;
  if (candidate.sources.includes("saved")) {
    if (!facts) {
      blockingMismatch = true;
      validation.push("saved IMDb ID could not be validated");
    }
    if (film.year !== undefined && facts?.year === undefined) {
      blockingMismatch = true;
      validation.push("saved IMDb ID has no year fact");
    }
    if (!facts?.titleType) {
      blockingMismatch = true;
      validation.push("saved IMDb ID has no title type fact");
    }
    if (!facts?.directors?.length) {
      blockingMismatch = true;
      validation.push("saved IMDb ID has no director fact");
    }
  }

  const scored: ImdbCandidate = { ...candidate, score, validation };
  if (facts?.primaryTitle) scored.factsTitle = facts.primaryTitle;
  if (facts?.originalTitle) scored.factsOriginalTitle = facts.originalTitle;
  if (facts?.year !== undefined) scored.factsYear = facts.year;
  if (facts?.titleType) scored.factsTitleType = facts.titleType;
  if (facts?.directors?.length) scored.factsDirectors = facts.directors;
  if (blockingMismatch) scored.blockingMismatch = true;
  return scored;
}

export function selectImdbMatch(
  film: MatchFilm,
  saved: ImdbCandidate | undefined,
  suggestions: ImdbCandidate[],
  factsById: Map<string, ImdbTitleFacts>,
  rematch: boolean
): MatchSelection {
  const candidates = [...(saved && !rematch ? [saved] : []), ...suggestions]
    .map((candidate) => scoreImdbCandidate(film, candidate, factsById.get(candidate.id)))
    .sort(compareCandidates);
  const savedCandidate = candidates.find((candidate) => candidate.sources.includes("saved"));
  if (savedCandidate && isAcceptableImdbMatch(savedCandidate) && !rematch) {
    return { selected: savedCandidate, candidates, shouldQuerySuggestions: false };
  }

  const selected = candidates.find(isAcceptableImdbMatch);
  return {
    ...(selected ? { selected } : {}),
    candidates,
    shouldQuerySuggestions: true
  };
}

export function mergeImdbCandidates(candidates: ImdbCandidate[]): ImdbCandidate[] {
  const byId = new Map<string, ImdbCandidate>();

  for (const candidate of candidates) {
    const existing = byId.get(candidate.id);
    if (!existing) {
      byId.set(candidate.id, candidate);
      continue;
    }

    const best = candidate.score > existing.score ? candidate : existing;
    byId.set(candidate.id, { ...best, sources: [...new Set([...existing.sources, ...candidate.sources])] });
  }

  return [...byId.values()];
}

export function isAcceptableImdbMatch(candidate: ImdbCandidate): boolean {
  return candidate.score >= ACCEPTANCE_THRESHOLD && !candidate.blockingMismatch;
}

function isMovieTitleType(value: string | undefined): boolean {
  return Boolean(value && ["movie", "short", "tvMovie", "video"].includes(value));
}

function compareCandidates(left: ImdbCandidate, right: ImdbCandidate): number {
  return right.score - left.score || (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER);
}
