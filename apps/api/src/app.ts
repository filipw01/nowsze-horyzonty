import { Hono } from "hono";
import { cors } from "hono/cors";
import { normalizeNhKey, type FilmBatchResponse, type FilmEnrichment, type NhFilmKey } from "@nowsze-horyzonty/shared";
import type { ApiConfig } from "./config.js";
import type { CuratedFilmRecord } from "./types.js";
import { createRateLimiter } from "./rateLimit.js";

interface AppDependencies {
  config: ApiConfig;
  films: Map<NhFilmKey, CuratedFilmRecord>;
}

export function createApp(dependencies: AppDependencies): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return null;
        if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) return origin;
        return dependencies.config.corsOrigins.has(origin) ? origin : null;
      },
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 86400
    })
  );

  app.use("/api/extension/*", createRateLimiter({ windowMs: 60_000, max: 120 }));

  app.get("/healthz", (context) => context.json({ ok: true }));

  app.post("/api/extension/films", async (context) => {
    const request = await context.req.json().catch(() => null);
    if (!isBatchRequest(request)) {
      return context.json({ error: "invalid_request" }, 400);
    }

    const keys = [...new Set(request.keys.map((key) => normalizeNhKey(key)).filter((key): key is NhFilmKey => key !== null))];
    if (keys.length > dependencies.config.maxBatchSize) {
      return context.json({ error: "batch_too_large", maxBatchSize: dependencies.config.maxBatchSize }, 413);
    }

    const response: FilmBatchResponse = {
      items: {},
      updatedAt: new Date().toISOString()
    };

    for (const key of keys) {
      const record = dependencies.films.get(key);
      if (record?.active) response.items[key] = toFilmEnrichment(record);
    }

    return context.json(response);
  });

  return app;
}

function toFilmEnrichment(record: CuratedFilmRecord): FilmEnrichment {
  const trailerUrl = record.trailerUrlOverride || record.trailerCandidates?.[0];
  const enrichment: FilmEnrichment = {
    nhKey: record.nhKey,
    festivalTitle: record.festivalTitle,
    imdbUrl: record.imdbUrl,
    summaryPl: record.summaryPl
  };

  if (record.originalTitle) enrichment.originalTitle = record.originalTitle;
  if (record.metacriticUrl) enrichment.metacriticUrl = record.metacriticUrl;
  if (trailerUrl) enrichment.trailerUrl = trailerUrl;
  if (record.genre) enrichment.genre = record.genre;
  if (record.imdbRating || record.imdbVotes) {
    enrichment.imdb = {};
    if (record.imdbRating) enrichment.imdb.rating = record.imdbRating;
    if (record.imdbVotes !== undefined) enrichment.imdb.votes = record.imdbVotes;
    if (record.imdbDataFetchedAt) enrichment.imdb.updatedAt = record.imdbDataFetchedAt;
  }
  if (record.metascore !== undefined) {
    enrichment.critics = { score: record.metascore };
    if (record.criticsReviewCount !== undefined) enrichment.critics.reviewCount = record.criticsReviewCount;
    if (record.imdbDataFetchedAt) enrichment.critics.updatedAt = record.imdbDataFetchedAt;
  } else if (record.criticsReviewCount !== undefined) {
    enrichment.critics = { reviewCount: record.criticsReviewCount };
  }

  return enrichment;
}

function isBatchRequest(value: unknown): value is { keys: string[]; debug?: boolean } {
  return typeof value === "object" && value !== null && Array.isArray((value as { keys?: unknown }).keys);
}
