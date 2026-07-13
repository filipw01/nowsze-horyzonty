import type { NhFilmKey } from "@nowsze-horyzonty/shared";

export interface CuratedFilmRecord {
  active: boolean;
  nhKey: NhFilmKey;
  festivalTitle: string;
  originalTitle?: string;
  imdbId: string;
  noweHoryzontyUrl: string;
  imdbUrl: string;
  metacriticUrl?: string;
  criticsReviewCount?: number;
  imdbRating?: string;
  imdbVotes?: number;
  imdbDataFetchedAt?: string;
  metascore?: number;
  genre?: string;
  trailerUrlOverride?: string;
  trailerCandidates?: string[];
  summaryPl: string;
  rawSourcesPrivate: {
    noweHoryzontyDescription?: string;
    imdbDescription?: string;
    fetchedAt?: string;
  };
}
