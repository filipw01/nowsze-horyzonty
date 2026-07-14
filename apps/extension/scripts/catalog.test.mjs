import { describe, expect, it } from "vitest";
import { projectCatalog } from "./catalog.mjs";

const sourceFilm = {
  active: true,
  nhKey: "/program/26/test-film",
  festivalTitle: "Test film",
  originalTitle: "Original test title",
  imdbId: "private-imdb-id",
  noweHoryzontyUrl: "https://private.example/nowe-horyzonty",
  imdbUrl: "https://www.imdb.com/title/tt0000001/",
  summaryPl: "Krótkie streszczenie.",
  genre: "Drama",
  trailerCandidates: ["https://www.youtube.com/watch?v=fallback"],
  trailerUrlOverride: "https://www.youtube.com/watch?v=override",
  imdbRating: "7.4",
  imdbVotes: 1250,
  imdbDataFetchedAt: "2026-07-13T12:00:00.000Z",
  metascore: 76,
  criticsReviewCount: 42,
  metacriticDataFetchedAt: "2026-07-13T13:00:00.000Z",
  metacriticUrl: "https://private.example/metacritic",
  rawSourcesPrivate: {
    imdbDescription: "Private source text",
    fetchedAt: "2026-07-13T14:00:00.000Z"
  }
};

describe("catalog projection", () => {
  it("excludes private source fields while retaining displayed enrichment data", () => {
    const [projected] = projectCatalog([sourceFilm]);

    expect(projected).toEqual({
      active: true,
      nhKey: "/program/26/test-film",
      festivalTitle: "Test film",
      originalTitle: "Original test title",
      imdbUrl: "https://www.imdb.com/title/tt0000001/",
      summaryPl: "Krótkie streszczenie.",
      genre: "Drama",
      trailerUrl: "https://www.youtube.com/watch?v=override",
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

    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("private-imdb-id");
    expect(serialized).not.toContain("private.example");
    expect(serialized).not.toContain("Private source text");
    expect(serialized).not.toContain("trailerCandidates");
  });

  it("uses a trailer candidate when no override is provided", () => {
    const [projected] = projectCatalog([{ ...sourceFilm, trailerUrlOverride: undefined }]);

    expect(projected.trailerUrl).toBe("https://www.youtube.com/watch?v=fallback");
  });

  it("does not skip an empty first candidate", () => {
    const [projected] = projectCatalog([
      { ...sourceFilm, trailerUrlOverride: undefined, trailerCandidates: ["", "https://www.youtube.com/watch?v=second"] }
    ]);

    expect(projected.trailerUrl).toBeUndefined();
  });
});
