import { describe, expect, it } from "vitest";
import { inferVisualCategory } from "./visual-brief";

describe("inferVisualCategory", () => {
  it("prefers an explicit targetId", () => {
    expect(inferVisualCategory({ targetId: "ui-visual", prompt: "product shot" })).toBe("ui");
    expect(inferVisualCategory({ targetId: "product-shot" })).toBe("product");
  });

  it("infers common prompt categories", () => {
    expect(inferVisualCategory({ prompt: "Premium SaaS login screen" })).toBe("ui");
    expect(inferVisualCategory({ prompt: "Luxury serum bottle product shot" })).toBe("product");
    expect(inferVisualCategory({ prompt: "Summer campaign key visual" })).toBe("promo");
    expect(inferVisualCategory({ prompt: "Xiaohongshu cover for a desk setup" })).toBe("social");
    expect(inferVisualCategory({ prompt: "Cyberpunk character concept art" })).toBe("concept");
    expect(inferVisualCategory({ prompt: "Premium tea brand moodboard" })).toBe("moodboard");
  });

  it("falls back to the role", () => {
    expect(inferVisualCategory({ role: "product-shot" })).toBe("product");
    expect(inferVisualCategory({ role: "hero" })).toBe("promo");
    expect(inferVisualCategory({ role: "background" })).toBe("concept");
  });
});
