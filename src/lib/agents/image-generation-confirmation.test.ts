import { describe, expect, it } from "vitest";

import type { ProjectFile } from "@/lib/project/schema";
import { buildImageGenerationConfirmation } from "./image-generation-confirmation";

function project(targetId?: string): ProjectFile {
  return {
    id: "p1",
    slug: "p1",
    title: "Demo",
    rawIdea: "像素仙侠门派山门立绘",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [],
    targetId,
  };
}

describe("buildImageGenerationConfirmation", () => {
  it("bans posters only for ui-visual", () => {
    const ui = buildImageGenerationConfirmation({
      project: project("ui-visual"),
      userMessage: "做个 App 首页",
      count: 1,
    });
    const game = buildImageGenerationConfirmation({
      project: project("game-art"),
      userMessage: "做个 App 首页风格的门派山门",
      count: 1,
    });
    expect(ui.reason).toMatch(/海报|营销/);
    expect(ui.prompt).toMatch(/poster/i);
    expect(game.reason).not.toMatch(/海报|营销/);
    expect(game.prompt).not.toMatch(/not a poster|promotional banner/i);
    expect(game.width).toBe(1280);
    expect(game.height).toBe(720);
    expect(ui.sizeMode).toBe("auto");
    expect(ui.width).toBe(1024);
    expect(ui.height).toBe(1024);
  });

  it("uses the pixel size written by the user", () => {
    const screen = buildImageGenerationConfirmation({
      project: project("ui-visual"),
      userMessage: "做招聘雷达落地页，尺寸 1536x864",
      count: 1,
    });
    expect(screen.sizeMode).toBe("fixed");
    expect(screen.width).toBe(1536);
    expect(screen.height).toBe(864);
  });

  it("uses skill default page size over the target canvas", () => {
    const board = buildImageGenerationConfirmation({
      project: project("style-board"),
      userMessage: "茶饮 纸感 雾绿 手写",
      count: 1,
      skillSize: { width: 1600, height: 900 },
    });
    expect(board.width).toBe(1600);
    expect(board.height).toBe(900);
  });
});
