import { describe, expect, it } from "vitest";
import { criticsTone, formatCompactCount, formatScreeningTimeRange, imdbTone, normalizeNhKey } from "./index.js";

describe("shared helpers", () => {
  it("normalizes Nowe Horyzonty keys", () => {
    expect(normalizeNhKey("program/26/fiord")).toBe("/program/26/fiord");
    expect(normalizeNhKey("https://www.nowehoryzonty.pl/program/26/fiord/")).toBe("/program/26/fiord");
    expect(normalizeNhKey("https://example.com/other")).toBeNull();
  });

  it("formats compact counts", () => {
    expect(formatCompactCount(982)).toBe("982");
    expect(formatCompactCount(2542)).toBe("2.5k");
    expect(formatCompactCount(14250)).toBe("14k");
    expect(formatCompactCount(1_250_000)).toBe("1.3M");
  });

  it("classifies score tones", () => {
    expect(imdbTone("7.0")).toBe("good");
    expect(imdbTone("6.2")).toBe("mixed");
    expect(imdbTone("5.9")).toBe("poor");
    expect(criticsTone(70)).toBe("good");
    expect(criticsTone(50)).toBe("mixed");
    expect(criticsTone(49)).toBe("poor");
  });

  it("formats screening time ranges with the pre-movie clips buffer", () => {
    expect(formatScreeningTimeRange("09:45", 146)).toBe("09:45 - 12:21");
    expect(formatScreeningTimeRange("23:30", 100)).toBe("23:30 - 01:20");
    expect(formatScreeningTimeRange("bad", 100)).toBeNull();
  });
});
