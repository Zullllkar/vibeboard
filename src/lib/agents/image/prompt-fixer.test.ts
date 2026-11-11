import { describe, expect, it } from "vitest";
import { autoFixImagePrompt } from "./prompt-fixer";
import { lintImagePrompt } from "./prompt-linter";

describe("autoFixImagePrompt", () => {
  it("removes generic words, quoted copy and layout clauses", () => {
    const input =
      "Modern clean professional SaaS login page with a 16px card, email and password inputs, a blue button, headline 'Welcome back', 8k, ultra detailed";
    const fixed = autoFixImagePrompt(input, "ui");

    expect(fixed.changes.length).toBeGreaterThan(0);
    expect(fixed.prompt).not.toMatch(/\b(modern|clean|professional|8k|ultra detailed)\b/i);
    expect(fixed.prompt).not.toMatch(/\b(button|password|16px|card)\b/i);
    expect(fixed.prompt).not.toContain("Welcome back");
    expect(fixed.prompt).toContain("SaaS login page");
    expect(fixed.prompt).toContain("empty space for text overlay");
  });

  it("adds missing visual anchors for product shots", () => {
    const fixed = autoFixImagePrompt("Luxury serum bottle product shot", "product");
    expect(fixed.prompt).toMatch(/\b(lighting|studio light)\b/i);
    expect(fixed.prompt).toMatch(/\b(paper|glass|matte|surface)\b/i);
    expect(fixed.prompt).toMatch(/\b(palette|muted)\b/i);
    expect(fixed.prompt).toContain("no added text");
  });

  it("removes abstract negatives without touching the text policy", () => {
    const fixed = autoFixImagePrompt(
      "Summer campaign key visual, modern clean, no clutter, avoid mess",
      "promo",
    );
    expect(fixed.prompt).not.toMatch(/\b(no clutter|avoid mess)\b/i);
    expect(fixed.prompt).toContain("no added text");
    expect(fixed.prompt).toContain("no watermark");
  });

  it("is idempotent", () => {
    const input =
      "Modern clean professional SaaS login page with a 16px card, email and password inputs, a blue button, 8k";
    const once = autoFixImagePrompt(input, "ui");
    const twice = autoFixImagePrompt(once.prompt, "ui");
    expect(twice.prompt).toBe(once.prompt);
  });

  it("respects the category word budget", () => {
    const long = [
      "Premium SaaS login screen",
      "soft directional lighting",
      "warm off-white paper",
      "muted cobalt palette",
      "centered with generous negative space",
      "35mm",
      "calm",
      "expensive",
      "editorial minimalism",
      "one accent color",
      "empty space for text overlay",
    ].join(", ");
    const fixed = autoFixImagePrompt(long, "ui");
    expect(fixed.prompt.split(/\s+/).length).toBeLessThanOrEqual(45);
  });

  it("does not remove the subject even when it contains a layout word", () => {
    const fixed = autoFixImagePrompt("Login page with a card and button", "ui");
    expect(fixed.prompt.toLowerCase()).toContain("login page");
  });

  it("returns an empty prompt unchanged", () => {
    expect(autoFixImagePrompt("   ", "ui")).toEqual({ prompt: "", changes: [] });
  });

  it("refuses to fix a prompt made only of generic words", () => {
    const fixed = autoFixImagePrompt("Modern clean professional 8k", "ui");
    expect(fixed.prompt).toBe("Modern clean professional 8k");
    expect(fixed.changes).toContain("主体全是 generic 词，需要手动改写");
  });

  it("leaves a clean prompt lint-clean", () => {
    const clean =
      "Premium SaaS login screen, soft directional lighting, warm off-white paper, muted cobalt palette, centered with generous negative space, calm and expensive, empty space for text overlay, 16:9";
    const fixed = autoFixImagePrompt(clean, "ui");
    const audit = lintImagePrompt(fixed.prompt, "ui");
    expect(audit.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });
});
