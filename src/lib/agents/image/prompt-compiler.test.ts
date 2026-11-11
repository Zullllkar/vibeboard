import { describe, expect, it } from "vitest";
import { compileVisualBrief, countWords } from "./prompt-compiler";
import type { VisualBrief } from "./visual-brief";

function brief(overrides: Partial<VisualBrief> = {}): VisualBrief {
  return {
    category: "ui",
    subject: "Premium SaaS login screen",
    visualAnchors: {
      lighting: "soft directional daylight from top-left",
      materials: ["warm off-white paper", "frosted glass"],
      palette: ["warm off-white", "muted cobalt"],
      composition: "centered, generous negative space",
      camera: "35mm",
      mood: ["calm", "expensive"],
    },
    textPolicy: "none",
    referenceIds: [],
    aspectRatio: "16:9",
    mustKeep: [],
    mustAvoid: [],
    ...overrides,
  };
}

describe("compileVisualBrief", () => {
  it("compiles a short visual-only prompt", () => {
    const prompt = compileVisualBrief(brief());
    expect(prompt).toContain("Premium SaaS login screen");
    expect(prompt).toContain("soft directional daylight");
    expect(prompt).toContain("warm off-white paper");
    expect(prompt).toContain("muted cobalt");
    expect(prompt).toContain("no added text");
    expect(prompt).toContain("16:9");
    expect(prompt).not.toMatch(/\b(button|input|headline|password|px)\b/i);
  });

  it("leaves space for text overlay instead of asking for rendered text", () => {
    const prompt = compileVisualBrief(brief({ textPolicy: "overlay" }));
    expect(prompt).toContain("empty space for text overlay");
    expect(prompt).not.toContain("no text");
  });

  it("preserves mustKeep for reference-guided edits", () => {
    const prompt = compileVisualBrief(
      brief({ category: "product", mustKeep: ["bottle shape", "logo placement"] }),
    );
    expect(prompt).toContain("keep bottle shape, logo placement unchanged");
  });

  it("keeps a UI prompt within the category budget", () => {
    const prompt = compileVisualBrief(
      brief({
        subject:
          "Premium SaaS login screen with a very long subject line that should be trimmed by the compiler because it exceeds the policy budget for UI",
      }),
    );
    expect(countWords(prompt)).toBeLessThanOrEqual(45);
  });
});

describe("countWords", () => {
  it("counts latin words and CJK characters", () => {
    expect(countWords("soft daylight")).toBe(2);
    expect(countWords("柔和日光")).toBe(4);
    expect(countWords("soft 日光")).toBe(3);
  });
});
