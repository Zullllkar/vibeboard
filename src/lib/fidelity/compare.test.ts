import { describe, expect, it } from "vitest";
import type { LayoutIR } from "@/lib/handoff/layout-ir";
import { compareDomToLayout } from "./compare";
import type { DomNodeSnapshot, DomSnapshot } from "./types";

function styles(overrides: Partial<DomNodeSnapshot["styles"]> = {}): DomNodeSnapshot["styles"] {
  return {
    color: "rgb(24, 24, 28)",
    backgroundColor: "rgb(245, 245, 247)",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 24,
    letterSpacing: 0,
    fontFamily: "Inter",
    borderRadius: 12,
    boxShadow: "none",
    opacity: 1,
    zIndex: 0,
    display: "block",
    position: "static",
    ...overrides,
  };
}

function node(overrides: Partial<DomNodeSnapshot> = {}): DomNodeSnapshot {
  return {
    path: "main > section > button",
    tag: "button",
    role: "button",
    text: "Welcome back",
    bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 },
    styles: styles(),
    visible: true,
    ...overrides,
  };
}

function layout(overrides: Partial<LayoutIR> = {}): LayoutIR {
  return {
    version: 1,
    mockupAssetId: "asset-1",
    width: 1440,
    height: 900,
    referenceImage: "asset.png",
    nodes: [
      {
        id: "cta",
        role: "cta",
        bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 },
        rebuildInCode: true,
        copy: "Welcome back",
        swatch: { dominant: "#f5f5f7" },
      },
    ],
    ...overrides,
  };
}

function dom(nodes: DomNodeSnapshot[]): DomSnapshot {
  return {
    version: 1,
    url: "http://localhost:3000",
    width: 1440,
    height: 900,
    nodes,
    capturedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("compareDomToLayout", () => {
  it("returns a high score for a matching DOM", () => {
    const report = compareDomToLayout(layout(), dom([node()]));
    expect(report).not.toBeNull();
    if (!report) return;
    expect(report.score).toBeGreaterThanOrEqual(9);
    expect(report.verdict).toBe("pass");
    expect(report.matchedSlots).toEqual(["cta"]);
    expect(report.deviations.filter((d) => d.severity === "high")).toHaveLength(0);
  });

  it("flags a missing slot", () => {
    const report = compareDomToLayout(
      layout(),
      dom([
        node({
          text: "Something else",
          bbox: { x: 0.8, y: 0.8, w: 0.05, h: 0.05 },
          tag: "div",
          role: "presentation",
        }),
      ]),
    );
    expect(report).not.toBeNull();
    if (!report) return;
    expect(report.unmatchedSlots).toEqual(["cta"]);
    expect(report.deviations.some((d) => d.kind === "missing" && d.severity === "high")).toBe(
      true,
    );
    expect(report.score).toBeLessThan(7);
  });

  it("flags a geometry mismatch", () => {
    const report = compareDomToLayout(
      layout(),
      dom([node({ bbox: { x: 0.3, y: 0.1, w: 0.3, h: 0.2 } })]),
    );
    expect(report).not.toBeNull();
    if (!report) return;
    expect(report.deviations.some((d) => d.kind === "spacing")).toBe(true);
  });

  it("flags a color mismatch with CIEDE2000", () => {
    const report = compareDomToLayout(
      layout(),
      dom([node({ styles: styles({ backgroundColor: "rgb(220, 38, 38)" }) })]),
    );
    expect(report).not.toBeNull();
    if (!report) return;
    const color = report.deviations.find((d) => d.kind === "color");
    expect(color).toBeDefined();
    expect(color?.severity).toBe("high");
    expect(color?.fixHint).toContain("ΔE00");
  });

  it("flags a content mismatch", () => {
    const report = compareDomToLayout(
      layout(),
      dom([node({ text: "Sign in" })]),
    );
    expect(report).not.toBeNull();
    if (!report) return;
    expect(report.deviations.some((d) => d.kind === "content")).toBe(true);
  });

  it("returns null when there is nothing to compare", () => {
    expect(compareDomToLayout(undefined, dom([node()]))).toBeNull();
    expect(compareDomToLayout(layout(), undefined)).toBeNull();
    expect(compareDomToLayout(layout({ nodes: [] }), dom([node()]))).toBeNull();
  });
});
