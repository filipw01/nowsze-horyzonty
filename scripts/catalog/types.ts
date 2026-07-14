import type { NhFilmKey } from "@nowsze-horyzonty/shared";

export interface RawSourcesPrivate {
  noweHoryzontyDescription?: string;
  fetchedAt?: string;
  imdbDescription?: string;
  imdbDescriptionFetchedAt?: string;
}

export interface CatalogRecord {
  active: boolean;
  nhKey: NhFilmKey;
  festivalTitle: string;
  originalTitle?: string;
  imdbId?: string;
  noweHoryzontyUrl?: string;
  imdbUrl?: string;
  imdbRating?: string;
  imdbVotes?: number;
  imdbDataFetchedAt?: string;
  genre?: string;
  metascore?: number;
  metacriticUrl?: string;
  metacriticDataFetchedAt?: string;
  criticsReviewCount?: number;
  trailerCandidates?: string[];
  trailerUrlOverride?: string;
  summaryPl: string;
  rawSourcesPrivate?: RawSourcesPrivate;
}

export interface DraftFilm {
  nhKey: NhFilmKey;
  festivalTitle: string;
  originalTitle?: string;
  director?: string;
  year?: number;
  noweHoryzontyUrl?: string;
  trailerCandidates?: string[];
  rawSourcesPrivate?: RawSourcesPrivate;
}

export interface MatchFilm {
  nhKey: NhFilmKey;
  festivalTitle: string;
  originalTitle?: string;
  director: string;
  year?: number;
}

export type ImdbCandidateSource = "saved" | "suggestion";

export interface ImdbCandidate {
  id: string;
  title: string;
  year?: number;
  titleType?: string;
  rank?: number;
  credit?: string;
  query: string;
  sources: ImdbCandidateSource[];
  score: number;
  factsTitle?: string;
  factsOriginalTitle?: string;
  factsYear?: number;
  factsTitleType?: string;
  factsDirectors?: string[];
  validation: string[];
  blockingMismatch?: true;
}

export interface ImdbTitleFacts {
  id: string;
  primaryTitle?: string;
  originalTitle?: string;
  titleType?: string;
  year?: number;
  genre?: string;
  directors?: string[];
}

export interface ImdbDatasetRecord {
  imdbRating?: string;
  imdbVotes?: number;
  genre?: string;
  fetchedAt: string;
}

export interface MetacriticCandidate {
  title: string;
  slug: string;
  year?: number;
  metascore?: number;
  criticReviewsUrl?: string;
  query: string;
  confidence: number;
}

export interface MetacriticMatch {
  metascore: number;
  metacriticUrl: string;
  criticsReviewCount?: number;
  fetchedAt: string;
  candidate: MetacriticCandidate;
}
