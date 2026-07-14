import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { patchImdbRecord, patchMetacriticRecord } from "./catalog.js";
import { extractImdbDescription, extractImdbGraphqlDescription } from "./imdb.js";
import { isAcceptableImdbMatch, savedImdbCandidate, scoreImdbCandidate, selectImdbMatch } from "./imdb-matching.js";
import type { CatalogRecord, ImdbCandidate, ImdbTitleFacts, MatchFilm, MetacriticMatch } from "./types.js";

const film: MatchFilm = {
  nhKey: "/program/26/example-film",
  festivalTitle: "Przykladowy film",
  originalTitle: "Example Film",
  director: "Jane Director",
  year: 2026
};

function facts(id: string, overrides: Partial<ImdbTitleFacts> = {}): ImdbTitleFacts {
  return {
    id,
    primaryTitle: "Example Film",
    originalTitle: "Example Film",
    titleType: "movie",
    year: 2026,
    directors: ["Jane Director"],
    ...overrides
  };
}

function suggestion(id: string): ImdbCandidate {
  return {
    id,
    title: "Example Film",
    titleType: "movie",
    year: 2026,
    query: "Example Film",
    sources: ["suggestion"],
    score: 0,
    validation: []
  };
}

test("IMDb candidate scoring accepts corroborated matches and blocks incompatible facts", () => {
  const accepted = scoreImdbCandidate(film, suggestion("tt0000001"), facts("tt0000001"));
  assert.equal(isAcceptableImdbMatch(accepted), true);
  assert.equal(accepted.blockingMismatch, undefined);

  const wrongYear = scoreImdbCandidate(film, suggestion("tt0000002"), facts("tt0000002", { year: 2018 }));
  assert.equal(isAcceptableImdbMatch(wrongYear), false);
  assert.equal(wrongYear.blockingMismatch, true);
  assert.match(wrongYear.validation.join("\n"), /year mismatch/);

  const wrongType = scoreImdbCandidate(film, suggestion("tt0000003"), facts("tt0000003", { titleType: "tvSeries" }));
  assert.equal(isAcceptableImdbMatch(wrongType), false);
  assert.match(wrongType.validation.join("\n"), /non-film/);

  const wrongDirector = scoreImdbCandidate(film, suggestion("tt0000004"), facts("tt0000004", { directors: ["Other Director"] }));
  assert.equal(isAcceptableImdbMatch(wrongDirector), false);
  assert.match(wrongDirector.validation.join("\n"), /director mismatch/);

  const incompleteFacts = facts("tt0000005");
  delete incompleteFacts.directors;
  const incompleteSaved = scoreImdbCandidate(film, savedImdbCandidate("tt0000005", film), incompleteFacts);
  assert.equal(isAcceptableImdbMatch(incompleteSaved), false);
  assert.match(incompleteSaved.validation.join("\n"), /saved IMDb ID has no director fact/);
});

test("a valid saved IMDb ID is retained unless --rematch is requested", () => {
  const saved = savedImdbCandidate("tt0000010", film);
  const suggested = suggestion("tt0000011");
  const factsById = new Map([
    [saved.id, facts(saved.id)],
    [suggested.id, facts(suggested.id)]
  ]);

  const retained = selectImdbMatch(film, saved, [suggested], factsById, false);
  assert.equal(retained.selected?.id, saved.id);
  assert.equal(retained.shouldQuerySuggestions, false);

  const rematched = selectImdbMatch(film, saved, [suggested], factsById, true);
  assert.equal(rematched.selected?.id, suggested.id);
  assert.equal(rematched.shouldQuerySuggestions, true);
});

test("IMDb and Metacritic patches preserve fields outside their ownership", () => {
  const record: CatalogRecord = {
    active: false,
    nhKey: "/program/26/example-film",
    festivalTitle: "Curated festival title",
    originalTitle: "Curated original title",
    imdbId: "tt0000001",
    imdbUrl: "https://www.imdb.com/title/tt0000001/",
    imdbRating: "4.0",
    imdbVotes: 1,
    imdbDataFetchedAt: "2026-01-01T00:00:00.000Z",
    genre: "Old genre",
    metascore: 12,
    metacriticUrl: "https://www.metacritic.com/movie/example",
    metacriticDataFetchedAt: "2026-01-02T00:00:00.000Z",
    criticsReviewCount: 3,
    trailerCandidates: ["https://example.test/trailer"],
    summaryPl: "Reviewed Polish summary.",
    rawSourcesPrivate: {
      noweHoryzontyDescription: "Private Nowe Horyzonty description.",
      fetchedAt: "2026-01-03T00:00:00.000Z",
      imdbDescription: "Existing IMDb description.",
      imdbDescriptionFetchedAt: "2026-01-04T00:00:00.000Z"
    }
  };

  const imdbPatched = patchImdbRecord(
    record,
    { imdbRating: "7.8", imdbVotes: 1234, genre: "Drama", fetchedAt: "2026-07-14T00:00:00.000Z" },
    undefined,
    true
  );
  assert.equal(imdbPatched.imdbRating, "7.8");
  assert.equal(imdbPatched.imdbVotes, 1234);
  assert.equal(imdbPatched.genre, "Drama");
  assert.equal(imdbPatched.summaryPl, record.summaryPl);
  assert.equal(imdbPatched.active, record.active);
  assert.equal(imdbPatched.metascore, record.metascore);
  assert.deepEqual(imdbPatched.trailerCandidates, record.trailerCandidates);
  assert.equal(imdbPatched.rawSourcesPrivate?.noweHoryzontyDescription, record.rawSourcesPrivate?.noweHoryzontyDescription);
  assert.equal(imdbPatched.rawSourcesPrivate?.imdbDescription, "Existing IMDb description.");

  const failedImdbLookup = patchImdbRecord(record, undefined, undefined, false);
  assert.deepEqual(failedImdbLookup, record);

  const metacriticMatch: MetacriticMatch = {
    metascore: 82,
    metacriticUrl: "https://www.metacritic.com/movie/example/critic-reviews/",
    criticsReviewCount: 57,
    fetchedAt: "2026-07-14T01:00:00.000Z",
    candidate: { title: "Example Film", slug: "example", query: "Example Film", confidence: 100 }
  };
  const metacriticPatched = patchMetacriticRecord(imdbPatched, metacriticMatch);
  assert.equal(metacriticPatched.metascore, 82);
  assert.equal(metacriticPatched.criticsReviewCount, 57);
  assert.equal(metacriticPatched.imdbRating, "7.8");
  assert.equal(metacriticPatched.summaryPl, record.summaryPl);
  assert.equal(metacriticPatched.rawSourcesPrivate?.imdbDescription, "Existing IMDb description.");
});

test("IMDb description extraction reads metadata from an HTML fixture", async () => {
  const html = await readFile(new URL("./fixtures/imdb-title.html", import.meta.url), "utf8");
  assert.equal(extractImdbDescription(html), "An exact IMDb description, with normalized whitespace.");
});

test("IMDb GraphQL description extraction accepts the title plot payload", () => {
  assert.equal(
    extractImdbGraphqlDescription({ data: { title: { plot: { plotText: { plainText: "  IMDb plot text.  " } } } } }),
    "IMDb plot text."
  );
});
