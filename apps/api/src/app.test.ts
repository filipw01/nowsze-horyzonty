import { describe, expect, it } from "vitest";
import type { NhFilmKey } from "@nowsze-horyzonty/shared";
import { createApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import type { CuratedFilmRecord } from "./types.js";

const nhKey = "/program/26/fiord" as NhFilmKey;

describe("extension films API", () => {
  it("returns static film enrichment from curated records", async () => {
    const { app } = createTestApp();

    const first = await postBatch(app, [nhKey]);
    expect(first.status).toBe(200);
    const firstJson = await first.json();
    expect(firstJson.items[nhKey].imdb.rating).toBe("8.4");
    expect(firstJson.items[nhKey].imdb.votes).toBe(1012);
    expect(firstJson.items[nhKey].imdb.updatedAt).toBe("2026-07-13T12:00:00.000Z");
    expect(firstJson.items[nhKey].critics.score).toBe(76);
    expect(firstJson.items[nhKey].critics.reviewCount).toBe(42);
    expect(firstJson.items[nhKey].genre).toBe("Drama, Thriller");
  });

  it("omits unmapped keys without failing the batch", async () => {
    const { app } = createTestApp();
    const response = await postBatch(app, ["/program/26/not-mapped" as NhFilmKey]);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.items).toEqual({});
  });

  it("returns curated static fields when rating fields are absent", async () => {
    const { app } = createTestApp({ includeRatings: false });

    const response = await postBatch(app, [nhKey]);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.items[nhKey].summaryPl).toContain("rodzina");
    expect(json.items[nhKey].trailerUrl).toBe("https://www.youtube.com/watch?v=0gdRZZVoinM");
    expect(json.items[nhKey].imdb).toBeUndefined();
  });
});

function createTestApp(options: { includeRatings?: boolean } = {}) {
  const includeRatings = options.includeRatings !== false;
  const config: ApiConfig = {
    port: 0,
    corsOrigins: new Set(["https://www.nowehoryzonty.pl"]),
    maxBatchSize: 120
  };

  const film: CuratedFilmRecord = {
    active: true,
    nhKey,
    festivalTitle: "Fiord",
    originalTitle: "Fjord",
    imdbId: "tt35410859",
    noweHoryzontyUrl: "https://www.nowehoryzonty.pl/program/26/fiord",
    imdbUrl: "https://www.imdb.com/title/tt35410859/",
    trailerCandidates: ["https://www.youtube.com/watch?v=0gdRZZVoinM"],
    summaryPl: "Rumuńsko-norweska rodzina trafia pod lupę instytucji.",
    rawSourcesPrivate: {}
  };

  if (includeRatings) {
    film.imdbRating = "8.4";
    film.imdbVotes = 1012;
    film.imdbDataFetchedAt = "2026-07-13T12:00:00.000Z";
    film.metascore = 76;
    film.criticsReviewCount = 42;
    film.genre = "Drama, Thriller";
  }

  const films = new Map<NhFilmKey, CuratedFilmRecord>([
    [nhKey, film]
  ]);

  return {
    app: createApp({ config, films })
  };
}

async function postBatch(app: ReturnType<typeof createApp>, keys: NhFilmKey[]): Promise<Response> {
  return await app.request("/api/extension/films", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.nowehoryzonty.pl"
    },
    body: JSON.stringify({ keys })
  });
}
