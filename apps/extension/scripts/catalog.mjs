function requireRecord(value, index) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Catalog entry ${index} must be an object`);
  }

  return value;
}

function requireString(record, field, index) {
  const value = record[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`Catalog entry ${index} has no ${field}`);
  }

  return value;
}

function copyOptionalString(source, target, field) {
  const value = source[field];
  if (typeof value === "string" && value) {
    target[field] = value;
  }
}

function copyOptionalNumber(source, target, field) {
  const value = source[field];
  if (typeof value === "number") {
    target[field] = value;
  }
}

function firstTrailerCandidate(record) {
  if (!Array.isArray(record.trailerCandidates)) {
    return undefined;
  }

  const [candidate] = record.trailerCandidates;
  return typeof candidate === "string" ? candidate : undefined;
}

export function projectCatalog(records) {
  if (!Array.isArray(records)) {
    throw new Error("Film catalog must be an array");
  }

  return records.map((value, index) => projectCatalogRecord(requireRecord(value, index), index));
}

function projectCatalogRecord(record, index) {
  if (typeof record.active !== "boolean") {
    throw new Error(`Catalog entry ${index} has no active flag`);
  }

  const projected = {
    active: record.active,
    nhKey: requireString(record, "nhKey", index),
    festivalTitle: requireString(record, "festivalTitle", index)
  };

  for (const field of ["originalTitle", "imdbUrl", "summaryPl", "genre"]) {
    copyOptionalString(record, projected, field);
  }

  const trailerUrl = record.trailerUrlOverride || firstTrailerCandidate(record);
  if (typeof trailerUrl === "string" && trailerUrl) {
    projected.trailerUrl = trailerUrl;
  }

  if (record.imdbRating || record.imdbVotes !== undefined) {
    const imdb = {};
    copyOptionalString(record, imdb, "imdbRating");
    copyOptionalNumber(record, imdb, "imdbVotes");
    copyOptionalString(record, imdb, "imdbDataFetchedAt");
    projected.imdb = {
      ...(imdb.imdbRating ? { rating: imdb.imdbRating } : {}),
      ...(imdb.imdbVotes !== undefined ? { votes: imdb.imdbVotes } : {}),
      ...(imdb.imdbDataFetchedAt ? { updatedAt: imdb.imdbDataFetchedAt } : {})
    };
  }

  if (record.metascore !== undefined) {
    const critics = { score: record.metascore };
    copyOptionalNumber(record, critics, "criticsReviewCount");
    copyOptionalString(record, critics, "metacriticDataFetchedAt");
    projected.critics = {
      score: critics.score,
      ...(critics.criticsReviewCount !== undefined ? { reviewCount: critics.criticsReviewCount } : {}),
      ...(critics.metacriticDataFetchedAt ? { updatedAt: critics.metacriticDataFetchedAt } : {})
    };
  } else if (record.criticsReviewCount !== undefined) {
    projected.critics = { reviewCount: record.criticsReviewCount };
  }

  return projected;
}
