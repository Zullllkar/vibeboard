import { describe, expect, it } from "vitest";
import type { ProjectFile } from "@/lib/project/schema";
import { addComparisonBoard, attachStyleCornerBoard, comparisonBoardRect } from "./comparison-board";
import { styleCornerPrompts } from "@/lib/targets/comparison-axis";

function project(): ProjectFile {
  return {
    id: "p1",
    slug: "demo",
    title: "Demo",
    rawIdea: "idea",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [],
  } as ProjectFile;
}

describe("comparisonBoardRect", () => {
  it("wraps the pair and leaves room for the question", () => {
    const rect = comparisonBoardRect([
      { x: 100, y: 80, w: 200, h: 120 },
      { x: 360, y: 80, w: 200, h: 140 },
    ]);
    expect(rect.x).toBeLessThan(100);
    expect(rect.y).toBeLessThan(80);
    expect(rect.w).toBeGreaterThan(460);
    expect(rect.h).toBeGreaterThan(140);
  });
});

describe("addComparisonBoard", () => {
  it("stores the question and the pictures in one board", () => {
    const next = addComparisonBoard(project(), {
      question: "哪张更快找到要做的事",
      memberAssetIds: ["a", "b"],
      memberNoteIds: ["spec-a"],
      x: 12,
      y: 24,
    });
    expect(next.comparisonBoards).toHaveLength(1);
    expect(next.comparisonBoards?.[0]?.question).toBe("哪张更快找到要做的事");
    expect(next.comparisonBoards?.[0]?.memberAssetIds).toEqual(["a", "b"]);
  });

  it("groups four style corners into one board and does not bind a skill", () => {
    const prompts = styleCornerPrompts("茶饮海报");
    const base = project();
    const next = attachStyleCornerBoard({
      ...base,
      targetId: "style-board",
      assets: prompts.map((prompt, index) => ({
        id: `corner-${index}`,
        prompt,
        src: `/api/assets/p/assets/corner-${index}.png`,
        width: 512,
        height: 512,
        model: "mock",
        createdAt: "2026-01-01T00:00:00.000Z",
        status: "candidate" as const,
        batchId: "batch-corners",
      })),
    });
    expect(next.comparisonBoards).toHaveLength(1);
    expect(next.comparisonBoards?.[0]?.memberAssetIds).toEqual([
      "corner-0",
      "corner-1",
      "corner-2",
      "corner-3",
    ]);
    expect(next.comparisonBoards?.[0]?.question).toBe("只看差别，可以不选");
    expect(next.skillId).toBeUndefined();
    expect(attachStyleCornerBoard(next).comparisonBoards).toHaveLength(1);
  });
});