import { patchMetacriticRecord, readCatalog, writeJson } from "./catalog/catalog.js";
import { findMetacriticMatch } from "./catalog/metacritic.js";
import type { MatchFilm } from "./catalog/types.js";

const catalog = await readCatalog();
const updated = [];
const unresolved: string[] = [];
const failures: string[] = [];

for (const [index, record] of catalog.entries()) {
  console.log(`[${index + 1}/${catalog.length}] Enriching ${record.nhKey}`);
  const film: MatchFilm = {
    nhKey: record.nhKey,
    festivalTitle: record.festivalTitle,
    director: ""
  };
  if (record.originalTitle) film.originalTitle = record.originalTitle;

  try {
    const match = await findMetacriticMatch(film);
    if (!match) unresolved.push(record.nhKey);
    updated.push(patchMetacriticRecord(record, match));
  } catch (error) {
    failures.push(`${record.nhKey}: ${errorMessage(error)}`);
    updated.push(record);
  }
}

await writeJson("data/films.json", updated);
console.log(`Updated Metacritic fields for ${catalog.length - unresolved.length - failures.length} records; ${unresolved.length} unresolved, ${failures.length} failures.`);
for (const failure of failures) console.error(failure);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
