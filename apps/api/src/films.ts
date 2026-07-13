import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeNhKey, type NhFilmKey } from "@nowsze-horyzonty/shared";
import type { CuratedFilmRecord } from "./types.js";

const DEFAULT_FILMS_PATH = fileURLToPath(new URL("../../../data/films.json", import.meta.url));

export function loadCuratedFilms(dataPath = process.env.FILMS_PATH || DEFAULT_FILMS_PATH): Map<NhFilmKey, CuratedFilmRecord> {
  const parsed = JSON.parse(readFileSync(dataPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${dataPath} to contain a film array`);
  }

  const records = new Map<NhFilmKey, CuratedFilmRecord>();
  for (const item of parsed) {
    const record = validateRecord(item);
    records.set(record.nhKey, record);
  }

  return records;
}

function validateRecord(value: unknown): CuratedFilmRecord {
  if (!isObject(value)) throw new Error("Invalid film record");

  const nhKey = normalizeNhKey(readString(value.nhKey, "nhKey"));
  if (!nhKey) throw new Error(`Invalid nhKey: ${String(value.nhKey)}`);

  const record: CuratedFilmRecord = {
    active: value.active !== false,
    nhKey,
    festivalTitle: readString(value.festivalTitle, "festivalTitle"),
    imdbId: readString(value.imdbId, "imdbId"),
    noweHoryzontyUrl: readString(value.noweHoryzontyUrl, "noweHoryzontyUrl"),
    imdbUrl: readString(value.imdbUrl, "imdbUrl"),
    summaryPl: readString(value.summaryPl, "summaryPl"),
    rawSourcesPrivate: isObject(value.rawSourcesPrivate) ? value.rawSourcesPrivate : {}
  };

  copyOptionalString(value, record, "originalTitle");
  copyOptionalString(value, record, "metacriticUrl");
  copyOptionalString(value, record, "imdbRating");
  copyOptionalString(value, record, "imdbDataFetchedAt");
  copyOptionalString(value, record, "genre");
  copyOptionalString(value, record, "trailerUrlOverride");
  copyOptionalNumber(value, record, "criticsReviewCount");
  copyOptionalNumber(value, record, "imdbVotes");
  copyOptionalNumber(value, record, "metascore");

  if (Array.isArray(value.trailerCandidates)) {
    record.trailerCandidates = value.trailerCandidates.filter((item): item is string => typeof item === "string");
  }

  return record;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing ${field}`);
  }
  return value.trim();
}

function copyOptionalString(
  source: Record<string, unknown>,
  target: CuratedFilmRecord,
  field: keyof CuratedFilmRecord
): void {
  const value = source[field];
  if (typeof value === "string" && value.trim()) {
    Object.assign(target, { [field]: value.trim() });
  }
}

function copyOptionalNumber(
  source: Record<string, unknown>,
  target: CuratedFilmRecord,
  field: keyof CuratedFilmRecord
): void {
  const value = source[field];
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    Object.assign(target, { [field]: value });
  }
}
