import { describe, expect, it } from "vitest";
import {
  ciede2000,
  colorDistanceCss,
  contrastRatio,
  parseCssColor,
} from "./color";

describe("parseCssColor", () => {
  it("parses hex, rgb and rgba", () => {
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("#18181c")).toEqual({ r: 24, g: 24, b: 28, a: 1 });
    expect(parseCssColor("rgb(24, 24, 28)")).toEqual({ r: 24, g: 24, b: 28, a: 1 });
    expect(parseCssColor("rgba(24, 24, 28, 0.5)")).toEqual({
      r: 24,
      g: 24,
      b: 28,
      a: 0.5,
    });
  });

  it("returns null for transparent or unparseable values", () => {
    expect(parseCssColor("transparent")).toBeNull();
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("color(srgb 1 0 0)")).toBeNull();
  });
});

describe("ciede2000", () => {
  it("is zero for identical colors", () => {
    const color = parseCssColor("#6366f1");
    expect(color).not.toBeNull();
    if (!color) return;
    expect(ciede2000(color, color)).toBeCloseTo(0, 5);
  });

  it("is about 100 for black vs white", () => {
    const black = parseCssColor("#000");
    const white = parseCssColor("#fff");
    expect(black && white).toBeTruthy();
    if (!black || !white) return;
    expect(ciede2000(black, white)).toBeGreaterThan(95);
  });

  it("detects a visible red/green difference", () => {
    const red = parseCssColor("#f00");
    const green = parseCssColor("#0f0");
    expect(red && green).toBeTruthy();
    if (!red || !green) return;
    expect(ciede2000(red, green)).toBeGreaterThan(60);
  });
});

describe("colorDistanceCss", () => {
  it("returns null for transparent surfaces", () => {
    expect(colorDistanceCss("rgba(0,0,0,0)", "#fff")).toBeNull();
  });

  it("returns a small distance for near-identical colors", () => {
    const distance = colorDistanceCss("#6366f1", "#6467f0");
    expect(distance).not.toBeNull();
    expect(distance ?? 99).toBeLessThan(2);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    const black = parseCssColor("#000");
    const white = parseCssColor("#fff");
    expect(black && white).toBeTruthy();
    if (!black || !white) return;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 0);
  });
});
