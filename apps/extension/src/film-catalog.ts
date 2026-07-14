import type { FilmEnrichment, NhFilmKey } from "@nowsze-horyzonty/shared";

export interface EmbeddedFilmRecord extends FilmEnrichment {
  active: boolean;
}

export type EnrichmentMap = Partial<Record<NhFilmKey, FilmEnrichment>>;

export function toEnrichmentMap(records: readonly EmbeddedFilmRecord[]): EnrichmentMap {
  const enrichments: EnrichmentMap = {};

  for (const record of records) {
    if (!record.active) continue;

    const { active: _active, ...enrichment } = record;
    enrichments[record.nhKey] = enrichment;
  }

  return enrichments;
}
