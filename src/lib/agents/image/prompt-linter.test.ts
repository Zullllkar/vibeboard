import { describe, expect, it } from "vitest";
import { lintImagePrompt, scorePromptAudit } from "./prompt-linter";

describe("lintImagePrompt", () => {
  it("passes a visual-only prompt", () => {
    const audit = lintImagePrompt(
      "Premium SaaS login screen, soft directional daylight, warm off-white paper, muted cobalt palette, centered with generous negative space, 35mm, calm and expensive, no text, 16:9",
      "ui",
    );
    expect(audit.ok).toBe(true);
    expect(audit.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("flags layout and copy leakage", () => {
    const audit = lintImagePrompt(
      "Modern SaaS login page with a 16px rounded card, email and password inputs, a blue button, headline 'Welcome back', clean professional, 8k",
      "ui",
    );
    expect(audit.ok).toBe(false);
    expect(audit.issues.map((issue) => issue.code)).toContain("layout-or-copy");
    expect(audit.issues.map((issue) => issue.code)).toContain("generic-language");
  });

  it("flags quoted copy", () => {
    const audit = lintImagePrompt(
      'Premium beauty product shot, soft daylight, cream palette, a label that says "Hydra Glow", 4:5',
      "product",
    );
    expect(audit.issues.map((issue) => issue.code)).toContain("quoted-copy");
  });

  it("flags low visual density", () => {
    const audit = lintImagePrompt(
      "A high quality image of a product for a modern company that wants a clean and professional look, 8k",
      "product",
    );
    expect(audit.issues.map((issue) => issue.code)).toContain("low-visual-density");
    expect(audit.issues.map((issue) => issue.code)).toContain("generic-language");
  });

  it("flags missing anchors", () => {
    const audit = lintImagePrompt("A premium SaaS login screen, 16:9", "ui");
    const codes = audit.issues.map((issue) => issue.code);
    expect(codes).toContain("missing-anchor");
  });

  it("skips visual token ratio for mostly-Chinese prompts", () => {
    const audit = lintImagePrompt(
      "高端 SaaS 登录页，柔和日光，暖白纸张，大量留白，一点钴蓝，16:9",
      "ui",
    );
    expect(audit.issues.map((issue) => issue.code)).toContain("vtr-skipped");
  });

  it("flags abstract negatives", () => {
    const audit = lintImagePrompt(
      "Premium product shot, soft daylight, cream palette, no clutter, 4:5",
      "product",
    );
    expect(audit.issues.map((issue) => issue.code)).toContain("abstract-negative");
  });

  it("scores a clean prompt above a leaky one", () => {
    const clean = lintImagePrompt(
      "Premium SaaS login screen, soft directional daylight, warm off-white paper, muted cobalt palette, centered with generous negative space, 35mm, calm and expensive, no added text, 16:9",
      "ui",
    );
    const leaky = lintImagePrompt(
      "Modern SaaS login page with a 16px card, email and password inputs, a blue button, headline 'Welcome back', clean professional, 8k",
      "ui",
    );
    expect(scorePromptAudit(clean)).toBeGreaterThan(scorePromptAudit(leaky));
    expect(scorePromptAudit(leaky)).toBeLessThan(60);
  });
});
