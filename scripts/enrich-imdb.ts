import { patchImdbRecord, readCatalog, writeJson } from "./catalog/catalog.js";
import { fetchImdbDescription, readImdbDatasetRecords } from "./catalog/imdb.js";
import { delay, FETCH_DELAY_MS } from "./catalog/network.js";

const catalog = await readCatalog();
const imdbIds = new Set(catalog.flatMap((record) => (record.imdbId ? [record.imdbId] : [])));
let datasetRecords = new Map();
let datasetError: string | undefined;

try {
  datasetRecords = await readImdbDatasetRecords(imdbIds);
} catch (error) {
  datasetError = errorMessage(error);
  console.error(`IMDb dataset enrichment failed; preserving existing IMDb ratings and genres: ${datasetError}`);
}

const updated = [];
const failures: string[] = [];
const missingDescriptions: string[] = [];

for (const [index, record] of catalog.entries()) {
  if (!record.imdbId) {
    updated.push(record);
    continue;
  }

  console.log(`[${index + 1}/${catalog.length}] Enriching ${record.nhKey}`);
  let description: string | undefined;
  let titleFetched = false;
  try {
    await delay(FETCH_DELAY_MS);
    description = await fetchImdbDescription(record.imdbId);
    titleFetched = true;
    if (!description) missingDescriptions.push(record.nhKey);
  } catch (error) {
    failures.push(`${record.nhKey}: ${errorMessage(error)}`);
  }

  const data = datasetRecords.get(record.imdbId);
  updated.push(patchImdbRecord(record, data, description, titleFetched || data !== undefined));
}

await writeJson("data/films.json", updated);
console.log(`Updated IMDb fields for ${imdbIds.size} records; ${failures.length} title fetches failed, ${missingDescriptions.length} descriptions were unavailable.`);
if (datasetError) console.error(`Dataset error: ${datasetError}`);
for (const failure of failures) console.error(failure);
for (const nhKey of missingDescriptions) console.warn(`${nhKey}: IMDb description metadata unavailable; existing description preserved.`);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
