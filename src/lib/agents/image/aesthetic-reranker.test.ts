import { describe, expect, it } from "vitest";
import {
  type ImageCandidate,
  pickBestImageCandidate,
  rankImageCandidates,
} from "./aesthetic-reranker";

const candidates: ImageCandidate[] = [
  { id: "a", imageUrl: "a.png", prompt: "a", meta: { quality: 0.4 } },
  { id: "b", imageUrl: "b.png", prompt: "b", meta: { quality: 0.9 } },
  { id: "c", imageUrl: "c.png", prompt: "c", meta: { quality: 0.7 } },
];

describe("rankImageCandidates", () => {
  it("ranks by scorer score", async () => {
    const ranked = await rankImageCandidates(candidates, (candidate) =>
      Number(candidate.meta?.quality ?? 0),
    );
    expect(ranked.map((candidate) => candidate.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps original order on ties", async () => {
    const ranked = await rankImageCandidates(candidates, () => 1);
    expect(ranked.map((candidate) => candidate.id)).toEqual(["a", "b", "c"]);
  });

  it("treats scorer errors as zero instead of failing the batch", async () => {
    const ranked = await rankImageCandidates(candidates, (candidate) => {
      if (candidate.id === "b") throw new Error("boom");
      return Number(candidate.meta?.quality ?? 0);
    });
    expect(ranked.map((candidate) => candidate.id)).toEqual(["c", "a", "b"]);
  });

  it("returns original order when no scorer is provided", async () => {
    const ranked = await rankImageCandidates(candidates);
    expect(ranked.map((candidate) => candidate.id)).toEqual(["a", "b", "c"]);
    expect(ranked.every((candidate) => candidate.score === 0)).toBe(true);
  });
});

describe("pickBestImageCandidate", () => {
  it("returns the highest-scored candidate", async () => {
    const best = await pickBestImageCandidate(candidates, (candidate) =>
      Number(candidate.meta?.quality ?? 0),
    );
    expect(best?.id).toBe("b");
  });

  it("returns undefined for an empty batch", async () => {
    expect(await pickBestImageCandidate([], () => 1)).toBeUndefined();
  });
});
