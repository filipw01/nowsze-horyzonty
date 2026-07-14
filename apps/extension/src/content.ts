import {
  criticsTone,
  formatCompactCount,
  formatScreeningTimeRange,
  imdbTone,
  normalizeNhKey,
  type FilmEnrichment,
  type NhFilmKey
} from "@nowsze-horyzonty/shared";
import { toEnrichmentMap, type EnrichmentMap } from "./film-catalog.js";
import { embeddedFilmCatalog } from "virtual:film-catalog";

const STARTUP_RETRIES = [0, 300, 900, 1800, 3200];

type ScreeningFacts = {
  title?: string;
  runtimeMinutes?: number;
  metkaCount?: string;
};

const enrichments: EnrichmentMap = toEnrichmentMap(embeddedFilmCatalog);
let screeningFactsById: Record<string, ScreeningFacts> | null = null;

void boot();

function boot(): void {
  for (const delay of STARTUP_RETRIES) {
    window.setTimeout(runOnce, delay);
  }

  document.addEventListener("mouseover", (event) => schedulePopoverPatch(event.target), true);
  document.addEventListener("focusin", (event) => schedulePopoverPatch(event.target), true);
}

function runOnce(): void {
  const anchors = findScreeningAnchors();
  if (!anchors.length) return;
  renderGridRatings(anchors);
}

function findScreeningAnchors(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>("a.bs[href]")];
}

function getNhKey(anchor: HTMLAnchorElement): NhFilmKey | null {
  const href = anchor.getAttribute("href");
  return href ? normalizeNhKey(href) : null;
}

function renderGridRatings(anchors: HTMLAnchorElement[]): void {
  for (const anchor of anchors) {
    renderTimeRange(anchor);
    renderMetkaCount(anchor);

    const key = getNhKey(anchor);
    const item = key ? enrichments[key] : undefined;
    const ratingText = gridRatingText(item);
    const existing = anchor.querySelector<HTMLElement>(".nhx-grid-rating");

    if (!ratingText) {
      existing?.remove();
      continue;
    }

    const rating = existing ?? document.createElement("span");
    anchor.classList.add("nhx-grid-enhanced");
    rating.className = "nhx-grid-rating";
    rating.replaceChildren(...createGridRatingNodes(item));
    rating.title = "IMDb rating";

    if (!existing) {
      const timeNode = anchor.querySelector(".czs");
      anchor.insertBefore(rating, timeNode);
    }
  }
}

function renderTimeRange(anchor: HTMLAnchorElement, popover?: HTMLElement): void {
  const time = anchor.querySelector<HTMLElement>(".czs");
  if (!time) return;

  const startTime = time.dataset.nhxStartTime || time.textContent?.trim();
  const runtimeMinutes = getRuntimeMinutes(anchor, popover);
  if (!startTime || !runtimeMinutes) return;

  const range = formatScreeningTimeRange(startTime, runtimeMinutes);
  if (!range) return;

  time.dataset.nhxStartTime = startTime;
  time.textContent = range;
}

function gridRatingText(item: FilmEnrichment | undefined): string | null {
  if (!item?.imdb?.rating) return null;
  const votes = item.imdb.votes ? ` (${formatCompactCount(item.imdb.votes)})` : "";
  return `${item.imdb.rating}${votes}`;
}

function createGridRatingNodes(item: FilmEnrichment | undefined): Node[] {
  if (!item?.imdb?.rating) return [];

  const score = document.createElement("span");
  score.className = `nhx-grid-score nhx-tone-${imdbTone(item.imdb.rating)}`;
  score.textContent = item.imdb.rating;

  if (!item.imdb.votes) return [score];

  const votes = document.createElement("span");
  votes.className = "nhx-grid-votes";
  votes.textContent = `\u00a0(${formatCompactCount(item.imdb.votes)})`;
  return [score, votes];
}

function renderMetkaCount(anchor: HTMLAnchorElement, popover?: HTMLElement): void {
  const count = getMetkaCount(anchor, popover);
  const target = findMetkaContainer(anchor);
  const existing = findMetkaBadge(anchor);

  if (!count) {
    existing?.remove();
    return;
  }

  const badge = existing ?? document.createElement("span");
  anchor.classList.add("nhx-grid-enhanced");
  target.classList.add("nhx-metka-enhanced");
  target.parentElement?.classList.add("nhx-metka-container");
  badge.className = "nhx-grid-metkas";
  badge.textContent = count;
  badge.title = "Liczba metek";

  if (badge.parentElement !== target) {
    badge.remove();
    target.append(badge);
  }
}

function findMetkaContainer(anchor: HTMLAnchorElement): HTMLElement {
  const next = anchor.nextElementSibling;
  return next instanceof HTMLElement && next.matches("a.metka") ? next : anchor;
}

function findMetkaBadge(anchor: HTMLAnchorElement): HTMLElement | null {
  return findMetkaContainer(anchor).querySelector<HTMLElement>(".nhx-grid-metkas") ?? anchor.querySelector<HTMLElement>(".nhx-grid-metkas");
}

function schedulePopoverPatch(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const anchor = target.closest<HTMLAnchorElement>("a.bs[href]");
  if (!anchor) return;

  for (const delay of [0, 80, 220, 520]) {
    window.setTimeout(() => patchVisiblePopovers(anchor), delay);
  }
}

function patchVisiblePopovers(anchor: HTMLAnchorElement): void {
  const key = getNhKey(anchor);
  const item = key ? enrichments[key] : undefined;

  const title = anchor.querySelector(".op")?.textContent?.trim();
  const popovers = [...document.querySelectorAll<HTMLElement>("[data-tippy-root] .ToolTipK .wn")];

  for (const popover of popovers) {
    if (!isMatchingPopover(popover, anchor, item, title)) continue;

    renderTimeRange(anchor, popover);
    renderMetkaCount(anchor, popover);
    renderPopoverTimeRange(popover, anchor);
    if (!item) continue;

    removeOriginalTitleFromPopover(popover, item);
    if (popover.querySelector(".nhx-enhanced")) continue;

    insertEnhancedPopoverContent(popover, item);
  }
}

function renderPopoverTimeRange(popover: HTMLElement, anchor: HTMLAnchorElement): void {
  const time = popover.querySelector<HTMLElement>(".ttczas");
  if (!time) return;

  const originalText = time.dataset.nhxOriginalText || time.textContent?.trim();
  const startTime = anchor.querySelector<HTMLElement>(".czs")?.dataset.nhxStartTime || originalText?.match(/\d{1,2}:\d{2}/)?.[0];
  const runtimeMinutes = getRuntimeMinutes(anchor, popover);
  if (!originalText || !startTime || !runtimeMinutes) return;

  const range = formatScreeningTimeRange(startTime, runtimeMinutes);
  if (!range) return;

  time.dataset.nhxOriginalText = originalText;
  time.textContent = originalText.replace(startTime, range);
}

function insertEnhancedPopoverContent(popover: HTMLElement, item: FilmEnrichment): void {
  const title = findTitleNode(popover);
  const originalTitle = createOriginalTitleLine(item, title);
  const ratings = createRatingsLine(item);
  const links = createLinksLine(item);
  const summary = createSummaryLine(item);
  const headlineNodes = [originalTitle, ratings, links].filter((node): node is HTMLElement => node !== null);

  insertAfter(title, headlineNodes);
  removeOriginalTitleFromPopover(popover, item);
  insertGenreIntoFilmDetails(popover, item);

  const summaryAnchor = popover.querySelector<HTMLElement>(".cy") || title;
  if (summary) {
    insertAfter(summaryAnchor, [summary]);
  }
}

function createOriginalTitleLine(item: FilmEnrichment, title: HTMLElement | null): HTMLElement | null {
  const originalTitle = item.originalTitle?.trim();
  if (!originalTitle || normalizeTitle(originalTitle) === normalizeTitle(title?.textContent)) return null;

  const line = document.createElement("div");
  line.className = "nhx-enhanced nhx-popover-original-title";
  line.textContent = originalTitle;
  return line;
}

function createGenreLine(item: FilmEnrichment): HTMLSpanElement | null {
  if (!item.genre) return null;

  const genre = document.createElement("span");
  genre.className = "nhx-enhanced nhx-popover-genre";
  genre.textContent = item.genre;
  return genre;
}

function insertGenreIntoFilmDetails(popover: HTMLElement, item: FilmEnrichment): void {
  const genre = createGenreLine(item);
  const details = popover.querySelector<HTMLElement>(".danefil");
  if (!genre || !details) return;

  const firstBreak = [...details.childNodes].find((node) => node.nodeName === "BR");
  if (firstBreak?.nextSibling) {
    details.insertBefore(genre, firstBreak.nextSibling);
    return;
  }

  details.append(document.createElement("br"), genre);
}

function removeOriginalTitleFromPopover(popover: HTMLElement, item: FilmEnrichment): void {
  removeOriginalTitleFromTorg(popover, item);
  removeOriginalTitleFromFilmDetails(popover, item);
}

function removeOriginalTitleFromTorg(popover: HTMLElement, item: FilmEnrichment): void {
  const originalTitle = item.originalTitle?.trim();
  if (!originalTitle) return;

  for (const node of popover.querySelectorAll<HTMLElement>(".torg")) {
    node.remove();
  }
}

function removeOriginalTitleFromFilmDetails(popover: HTMLElement, item: FilmEnrichment): void {
  const originalTitle = item.originalTitle?.trim();
  const details = popover.querySelector<HTMLElement>(".danefil");
  if (!originalTitle || !details) return;

  const leadingNodes = nodesBeforeFirstBreak(details);
  const leadingText = leadingNodes.map((node) => node.textContent || "").join("");
  if (normalizeTitle(leadingText) !== normalizeTitle(originalTitle)) return;

  for (const node of leadingNodes) node.remove();
  while (details.firstChild && (details.firstChild.nodeName === "BR" || !details.firstChild.textContent?.trim())) {
    details.firstChild.remove();
  }
}

function nodesBeforeFirstBreak(element: HTMLElement): ChildNode[] {
  const nodes: ChildNode[] = [];
  for (const node of element.childNodes) {
    if (node.nodeName === "BR") break;
    nodes.push(node);
  }
  return nodes;
}

function createSummaryLine(item: FilmEnrichment): HTMLElement | null {
  if (!item.summaryPl) return null;

  const summary = document.createElement("div");
  summary.className = "nhx-enhanced nhx-popover-summary";
  summary.textContent = item.summaryPl;
  return summary;
}

function createLinksLine(item: FilmEnrichment): HTMLElement | null {
  const links = [
    item.imdbUrl ? createExternalLink("IMDb", item.imdbUrl) : null,
    item.trailerUrl ? createExternalLink(trailerLabel(), item.trailerUrl) : null
  ].filter((link): link is HTMLAnchorElement => link !== null);

  if (!links.length) return null;

  const line = document.createElement("div");
  line.className = "nhx-enhanced nhx-popover-links";
  line.append(...links);
  return line;
}

function createExternalLink(label: string, url: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "nhx-popover-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function createRatingsLine(item: FilmEnrichment): HTMLElement | null {
  const fragments: Array<Node | string> = [];

  if (item.imdb?.rating) {
    fragments.push(createScore(item.imdb.rating, imdbTone(item.imdb.rating)));
    if (item.imdb.votes) fragments.push(` (${formatCompactCount(item.imdb.votes)})`);
  }

  if (item.critics?.score !== undefined) {
    if (fragments.length) fragments.push(" · ");
    fragments.push("Critics ");
    fragments.push(createScore(String(item.critics.score), criticsTone(item.critics.score)));
    if (item.critics.reviewCount !== undefined) fragments.push(` (${formatCompactCount(item.critics.reviewCount)})`);
  }

  if (!fragments.length) return null;

  const line = document.createElement("div");
  line.className = "nhx-enhanced nhx-popover-ratings";
  for (const fragment of fragments) {
    line.append(fragment);
  }
  return line;
}

function createScore(text: string, tone: "good" | "mixed" | "poor"): HTMLElement {
  const score = document.createElement("span");
  score.className = `nhx-score nhx-tone-${tone}`;
  score.textContent = text;
  return score;
}

function insertAfter(anchor: HTMLElement | null, nodes: HTMLElement[]): HTMLElement | null {
  if (!nodes.length) return anchor;

  let cursor: HTMLElement | null = anchor;
  for (const node of nodes) {
    if (cursor) {
      cursor.after(node);
    } else {
      document.querySelector("[data-tippy-root] .ToolTipK .wn")?.append(node);
    }
    cursor = node;
  }

  return cursor;
}

function isMatchingPopover(
  popover: HTMLElement,
  anchor: HTMLAnchorElement,
  item: FilmEnrichment | undefined,
  anchorTitle?: string
): boolean {
  const popoverTitle = findTitleNode(popover)?.textContent?.trim();
  if (!popoverTitle) return true;

  const facts = getScreeningFacts(anchor, popover);
  const candidates = [anchorTitle, facts.title, item?.festivalTitle, item?.originalTitle].map(normalizeTitle).filter(Boolean);
  return candidates.includes(normalizeTitle(popoverTitle));
}

function findTitleNode(popover: HTMLElement): HTMLElement | null {
  return (
    popover.querySelector<HTMLElement>("h5") ??
    [...popover.children].find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        !child.classList.contains("ttczas") &&
        !child.classList.contains("nhx-enhanced") &&
        !child.matches(".danefil, .cy, .innes, .mtk, .priorytet, .ozn")
    ) ??
    null
  );
}

function trailerLabel(): string {
  return document.documentElement.lang.toLowerCase().startsWith("pl") ? "Zwiastun" : "Trailer";
}

function getRuntimeMinutes(anchor: HTMLAnchorElement, popover?: HTMLElement): number | null {
  const existing = anchor.dataset.nhxRuntimeMinutes;
  if (existing) return Number.parseInt(existing, 10);

  const runtimeMinutes = getScreeningFacts(anchor, popover).runtimeMinutes;
  if (runtimeMinutes) anchor.dataset.nhxRuntimeMinutes = String(runtimeMinutes);
  return runtimeMinutes ?? null;
}

function getMetkaCount(anchor: HTMLAnchorElement, popover?: HTMLElement): string | null {
  const existing = anchor.dataset.nhxMetkaCount;
  if (existing) return existing;

  const count = getScreeningFacts(anchor, popover).metkaCount;
  if (count) anchor.dataset.nhxMetkaCount = count;
  return count ?? null;
}

function getScreeningFacts(anchor: HTMLAnchorElement, popover?: HTMLElement): ScreeningFacts {
  const id = getScreeningId(anchor);
  const facts = id ? { ...getScreeningFactsById()[id] } : {};
  const runtimeFromPopover = popover ? parseRuntimeMinutesFromText(popover.textContent || "") : null;
  const metkaFromPopover = popover ? parseMetkaCountFromPopover(popover) : null;

  if (runtimeFromPopover) facts.runtimeMinutes = runtimeFromPopover;
  if (metkaFromPopover) facts.metkaCount = metkaFromPopover;
  if (id) getScreeningFactsById()[id] = facts;
  return facts;
}

function getScreeningFactsById(): Record<string, ScreeningFacts> {
  screeningFactsById ??= parseScreeningFactsFromScripts();
  return screeningFactsById;
}

function parseScreeningFactsFromScripts(): Record<string, ScreeningFacts> {
  const factsById: Record<string, ScreeningFacts> = {};
  const setPattern = /cz\.set\((\d+),\s*\[\s*'((?:\\.|[^'\\])*)'\s*,\s*"([^"]*)"/g;

  for (const script of document.scripts) {
    const source = script.textContent || "";
    if (!source.includes("cz.set(")) continue;

    for (const match of source.matchAll(setPattern)) {
      const [, id, tooltipSource, metkaSource] = match;
      if (!id || !tooltipSource) continue;

      const title = parseTitleFromTooltipSource(tooltipSource);
      const runtimeMinutes = parseRuntimeMinutesFromText(tooltipSource);
      const metkaCount = normalizeCount(metkaSource);
      factsById[id] = {
        ...(title ? { title } : {}),
        ...(runtimeMinutes ? { runtimeMinutes } : {}),
        ...(metkaCount ? { metkaCount } : {})
      };
    }
  }

  return factsById;
}

function getScreeningId(anchor: HTMLAnchorElement): string | null {
  return anchor.id.match(/^b_s_(\d+)$/)?.[1] || null;
}

function parseRuntimeMinutesFromText(text: string): number | null {
  const match = text.match(/\\?\/\s*(\d{1,3})\s*(?:\\u2019|\\u2032|[’'′])/);
  if (!match?.[1]) return null;

  const minutes = Number.parseInt(match[1], 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function parseTitleFromTooltipSource(text: string): string | null {
  const match = text.match(/<h5>(.*?)<\\?\/h5>/i);
  return match?.[1] ? normalizeTooltipText(match[1]) : null;
}

function normalizeTooltipText(value: string): string {
  const decoded = value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\'/g, "'")
    .replace(/\\"/g, "\"")
    .replace(/\\\//g, "/");
  const parser = document.createElement("textarea");
  parser.innerHTML = decoded;
  return parser.value.replace(/\s+/g, " ").trim();
}

function parseMetkaCountFromPopover(popover: HTMLElement): string | null {
  return normalizeCount(popover.querySelector(".mtk .f7")?.textContent);
}

function normalizeCount(value: string | null | undefined): string | null {
  const count = value?.replace(/\s+/g, "") || "";
  return /^\d+$/.test(count) ? count : null;
}

function normalizeTitle(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() || "";
}
