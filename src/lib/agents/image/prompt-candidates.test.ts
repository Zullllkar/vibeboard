import { describe, expect, it } from "vitest";
import { buildPromptCandidates } from "./prompt-candidates";
import type { VisualBrief } from "./visual-brief";

function brief(overrides: Partial<VisualBrief> = {}): VisualBrief {
  return {
    category: "ui",
    subject: "Premium SaaS login screen",
    visualAnchors: {
      lighting: "soft directional daylight",
      materials: ["warm off-white paper", "frosted glass"],
      palette: ["warm off-white", "muted cobalt"],
      composition: "centered with generous negative space",
      camera: "35mm",
      mood: ["calm", "expensive"],
    },
    textPolicy: "overlay",
    referenceIds: [],
    aspectRatio: "16:9",
    mustKeep: [],
    mustAvoid: [],
    ...overrides,
  };
}

describe("buildPromptCandidates", () => {
  it("builds distinct, audited candidates sorted by score", () => {
    const candidates = buildPromptCandidates(brief(), 4);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(new Set(candidates.map((c) => c.prompt)).size).toBe(candidates.length);
    for (const candidate of candidates) {
      expect(candidate.audit.category).toBe("ui");
      expect(candidate.score).toBeGreaterThanOrEqual(0);
      expect(candidate.score).toBeLessThanOrEqual(100);
    }
    const scores = candidates.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("keeps the subject and visual-only constraints", () => {
    const best = buildPromptCandidates(brief(), 3)[0];
    expect(best.prompt).toContain("Premium SaaS login screen");
    expect(best.prompt).toContain("empty space for text overlay");
    expect(best.prompt).not.toMatch(/\b(button|input|headline|password|px)\b/i);
  });

  it("returns one candidate when asked for one", () => {
    const candidates = buildPromptCandidates(brief(), 1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].emphasis).toBe("balanced");
  });
});
