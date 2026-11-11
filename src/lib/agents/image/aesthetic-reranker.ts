/**
 * Image-level best-of-N reranker.
 *
 * Provider-agnostic and scorer-agnostic: the caller supplies a scorer (a cheap
 * aesthetic model, a VLM pairwise judge, or a human picker). This module just
 * handles the ranking contract, tie-breaking and per-candidate failure.
 *
 * The executor can wire this in when it starts generating N images per task;
 * today it is used by tests and by future callers.
 */

export interface ImageCandidate {
  id: string;
  imageUrl: string;
  prompt: string;
  meta?: Record<string, unknown>;
}

export type AestheticScorer = (candidate: ImageCandidate) => number | Promise<number>;

export interface RankedImageCandidate extends ImageCandidate {
  score: number;
}

/**
 * Score every candidate, keep original order on ties, and never let one bad
 * scorer call discard the whole batch.
 */
export async function rankImageCandidates(
  candidates: ImageCandidate[],
  scorer?: AestheticScorer,
): Promise<RankedImageCandidate[]> {
  if (candidates.length === 0) return [];
  if (!scorer) {
    return candidates.map((candidate) => ({ ...candidate, score: 0 }));
  }

  const scored = await Promise.all(
    candidates.map(async (candidate, index) => {
      try {
        const score = await scorer(candidate);
        return {
          ...candidate,
          score: Number.isFinite(score) ? score : 0,
          index,
        };
      } catch {
        return { ...candidate, score: 0, index };
      }
    }),
  );

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ index: _index, ...candidate }) => candidate);
}

export async function pickBestImageCandidate(
  candidates: ImageCandidate[],
  scorer?: AestheticScorer,
): Promise<RankedImageCandidate | undefined> {
  const ranked = await rankImageCandidates(candidates, scorer);
  return ranked[0];
}
