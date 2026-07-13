import { writeFile } from "node:fs/promises";
import { load } from "cheerio";
import { normalizeNhKey, type NhFilmKey } from "@nowsze-horyzonty/shared";

const DEFAULT_DAYS = ["23", "24", "25", "26", "27", "28", "29", "30", "31", "1", "2"];
const BASE_URL = "https://www.nowehoryzonty.pl";

interface DiscoveredFilm {
  nhKey: NhFilmKey;
  title: string;
  detailUrl: string;
  screeningIds: string[];
  calendarDays: string[];
}

const days = process.argv.slice(2);
const calendarDays = days.length ? days : DEFAULT_DAYS;
const discovered = new Map<NhFilmKey, DiscoveredFilm>();

for (const day of calendarDays) {
  const url = `${BASE_URL}/program/kalendarz/${day}`;
  console.log(`Fetching ${url}`);
  const html = await fetchText(url);
  const $ = load(html);

  $("a.bs[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const nhKey = normalizeNhKey(href);
    if (!nhKey) return;

    const title = $(element).find(".op").first().text().trim() || $(element).text().trim();
    const id = $(element).attr("id");
    const existing = discovered.get(nhKey);
    if (existing) {
      if (id) existing.screeningIds.push(id);
      existing.calendarDays.push(day);
      return;
    }

    discovered.set(nhKey, {
      nhKey,
      title,
      detailUrl: new URL(nhKey, BASE_URL).href,
      screeningIds: id ? [id] : [],
      calendarDays: [day]
    });
  });
}

const output = [...discovered.values()].sort((left, right) => left.nhKey.localeCompare(right.nhKey));
await writeFile("data/films.discovered.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${output.length} discovered entries to data/films.discovered.json`);

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}
