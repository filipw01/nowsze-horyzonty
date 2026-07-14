import { describe, expect, it } from "vitest";
import { toEnrichmentMap, type EmbeddedFilmRecord } from "./film-catalog.js";

const film: EmbeddedFilmRecord = {
  active: true,
  nhKey: "/program/26/test-film",
  festivalTitle: "Test film",
  summaryPl: "Krótkie streszczenie.",
  trailerUrl: "https://www.youtube.com/watch?v=test",
  imdb: {
    rating: "7.4",
    votes: 1250,
    updatedAt: "2026-07-13T12:00:00.000Z"
  },
  critics: {
    score: 76,
    reviewCount: 42,
    updatedAt: "2026-07-13T13:00:00.000Z"
  }
};

describe("embedded film catalog", () => {
  it("does not map inactive records", () => {
    const enrichments = toEnrichmentMap([{ ...film, active: false }]);

    expect(enrichments).toEqual({});
  });

  it("preserves trailer selection and rating metadata", () => {
    const enrichments = toEnrichmentMap([film]);

    expect(enrichments[film.nhKey]).toEqual({
      nhKey: film.nhKey,
      festivalTitle: film.festivalTitle,
      summaryPl: film.summaryPl,
      trailerUrl: "https://www.youtube.com/watch?v=test",
      imdb: {
        rating: "7.4",
        votes: 1250,
        updatedAt: "2026-07-13T12:00:00.000Z"
      },
      critics: {
        score: 76,
        reviewCount: 42,
        updatedAt: "2026-07-13T13:00:00.000Z"
      }
    });
  });
});
