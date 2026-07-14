export type NhFilmKey = `/program/${string}`;

export type RatingTone = "good" | "mixed" | "poor";

export const PRE_MOVIE_CLIPS_MINUTES = 10;

export interface FilmEnrichment {
  nhKey: NhFilmKey;
  festivalTitle: string;
  originalTitle?: string;
  imdbUrl?: string;
  trailerUrl?: string;
  genre?: string;
  summaryPl?: string;
  imdb?: {
    rating?: string;
    votes?: number;
    updatedAt?: string;
  };
  critics?: {
    score?: number;
    reviewCount?: number;
    updatedAt?: string;
  };
}

export function normalizeNhKey(input: string): NhFilmKey | null {
  let url: URL;
  try {
    url = new URL(input, "https://www.nowehoryzonty.pl/");
  } catch {
    return null;
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  return normalizedPath.startsWith("/program/") ? (normalizedPath as NhFilmKey) : null;
}

export function formatCompactCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "";
  if (count < 1_000) return String(Math.round(count));
  if (count < 10_000) return `${trimFixed(count / 1_000, 1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  return `${trimFixed(count / 1_000_000, 1)}M`;
}

export function imdbTone(rating: string | number): RatingTone {
  const value = typeof rating === "number" ? rating : Number.parseFloat(rating);
  if (!Number.isFinite(value)) return "mixed";
  if (value >= 7) return "good";
  if (value >= 6) return "mixed";
  return "poor";
}

export function criticsTone(score: number): RatingTone {
  if (score >= 70) return "good";
  if (score >= 50) return "mixed";
  return "poor";
}

export function formatScreeningTimeRange(
  startTime: string,
  runtimeMinutes: number,
  preMovieMinutes = PRE_MOVIE_CLIPS_MINUTES
): string | null {
  const start = parseClockTime(startTime);
  if (!start || !Number.isFinite(runtimeMinutes) || runtimeMinutes <= 0) return null;

  const endMinutes = start.hours * 60 + start.minutes + runtimeMinutes + preMovieMinutes;
  return `${formatClockTime(start.hours, start.minutes)} - ${formatClockTime(
    Math.floor(endMinutes / 60) % 24,
    endMinutes % 60
  )}`;
}

function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0$/, "");
}

function parseClockTime(value: string): { hours: number; minutes: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match?.[1] || !match[2]) return null;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return { hours, minutes };
}

function formatClockTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
