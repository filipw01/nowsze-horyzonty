import type { MatchFilm } from "./types.js";

function normalize(value: string, removeArticles: boolean): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, (letter) => (letter === "Ł" ? "L" : "l"))
    .replace(/[øØ]/g, (letter) => (letter === "Ø" ? "O" : "o"))
    .replace(/[đĐ]/g, (letter) => (letter === "Đ" ? "D" : "d"))
    .replace(/['’`]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return removeArticles ? normalized.replace(/\b(the|a|an|le|la|les|el|los|las)\b/g, "").replace(/\s+/g, " ").trim() : normalized;
}

export function normalizeTitle(value: string): string {
  return normalize(value, true);
}

function normalizePersonName(value: string): string {
  return normalize(value, false);
}

export function titleAliases(film: Pick<MatchFilm, "festivalTitle" | "originalTitle">): string[] {
  const titles = [film.originalTitle, film.festivalTitle].flatMap((value) => splitTitle(value || ""));
  return [...new Set(titles.map((title) => title.replace(/\s+/g, " ").trim()).filter((title) => title.length >= 2))].slice(0, 6);
}

function splitDirectorNames(value: string): string[] {
  return value
    .split(/\s*,\s*|\s+(?:i|and|&)\s+/i)
    .map(normalizePersonName)
    .filter((name) => name.length >= 3);
}

export function hasDirectorMatch(festivalDirector: string, imdbDirectors: string[]): boolean {
  const festivalNames = splitDirectorNames(festivalDirector);
  const normalizedImdbNames = imdbDirectors.map(normalizePersonName).filter(Boolean);
  return festivalNames.some((festivalName) => normalizedImdbNames.some((imdbName) => isSamePersonName(festivalName, imdbName)));
}

export function hasCreditDirectorMatch(festivalDirector: string, credit: string): boolean {
  const normalizedCredit = normalizePersonName(credit);
  return splitDirectorNames(festivalDirector).some((name) => normalizedCredit.includes(name));
}

export function isProgramBundle(film: Pick<MatchFilm, "nhKey" | "festivalTitle">): boolean {
  const key = film.nhKey.toLowerCase();
  const title = film.festivalTitle.toLowerCase();
  return (
    key.includes("zestaw") ||
    title.includes("zestaw") ||
    title.includes("netflix:") ||
    title.includes("sezon ") ||
    title.includes("pokaz laureata") ||
    title.includes("seans niespodzianka")
  );
}

function splitTitle(value: string): string[] {
  const withoutParenthetical = value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const parts = [value, withoutParenthetical].flatMap((title) => title.split(/\s+\/\s+|: /).map((part) => part.trim()));
  return [value, ...parts];
}

function isSamePersonName(left: string, right: string): boolean {
  if (left === right || left.includes(right) || right.includes(left)) return true;

  const leftTokens = left.split(" ").filter(Boolean);
  const rightTokens = right.split(" ").filter(Boolean);
  const matchingTokens = leftTokens.filter((leftToken) => rightTokens.some((rightToken) => isSameNameToken(leftToken, rightToken)));
  return matchingTokens.length >= Math.min(2, leftTokens.length, rightTokens.length);
}

function isSameNameToken(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  return levenshteinDistance(left, right) <= 1;
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0] as number;
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex] as number;
      const leftCost = (previous[rightIndex - 1] as number) + 1;
      const aboveCost = above + 1;
      const diagonalCost = diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      diagonal = above;
      previous[rightIndex] = Math.min(leftCost, aboveCost, diagonalCost);
    }
  }

  return previous[right.length] as number;
}
