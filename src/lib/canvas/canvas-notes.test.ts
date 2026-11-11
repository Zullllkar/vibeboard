import { describe, expect, it } from "vitest";
import type { ImageAsset } from "@/lib/project/assets-schema";
import type { ProjectFile } from "@/lib/project/schema";
import {
  CITE_SPAWN_ITEMS,
  canCiteFromAsset,
  composerPromptForCite,
  composerPromptForTextTask,
  defaultTitleForKind,
  activeStyleSpec,
  adoptStyleNotes,
  applyStyleSpecToPrompt,
  noteKindLabel,
  placeCitedNode,
  spawnCitedImage,
  spawnCitedTextNote,
  spawnStandaloneNote,
  upsertCanvasNote,
  deleteCanvasNote,
  persistCanvasNoteLayout,
  citePortScreenPosition,
  isCiteDragGesture,
  TEXT_NOTE_DEFAULT_H,
} from "./canvas-notes";

function asset(
  partial: Partial<ImageAsset> & Pick<ImageAsset, "id">
): ImageAsset {
  return {
    prompt: partial.prompt ?? partial.id,
    src: partial.src ?? `data:image/png;base64,${partial.id}`,
    width: partial.width ?? 1280,
    height: partial.height ?? 720,
    model: partial.model ?? "t",
    createdAt: partial.createdAt ?? "2026-08-12T00:00:00.000Z",
    status: partial.status ?? "candidate",
    ...partial,
  };
}

function project(assets: ImageAsset[], notes: ProjectFile["canvasNotes"] = []): ProjectFile {
  return {
    id: "p1",
    slug: "p1",
    title: "t",
    rawIdea: "test visual project",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    pages: [],
    assets,
    canvasNotes: notes,
  } as ProjectFile;
}

describe("cite spawn menu", () => {
  it("lists text kinds and image generation for citing a node", () => {
    const ids = CITE_SPAWN_ITEMS.map((item) => item.id);
    expect(ids).toEqual(["script", "copy", "rule", "spec", "image"]);
    expect(CITE_SPAWN_ITEMS[0]).toMatchObject({
      id: "script",
      label: "脚本",
      group: "text",
    });
    expect(CITE_SPAWN_ITEMS.find((item) => item.id === "image")).toMatchObject({
      group: "image",
      label: "图片生成",
    });
  });

  it("allows citing a finished image and rejects empty or generating ones", () => {
    expect(canCiteFromAsset(asset({ id: "ok" }))).toBe(true);
    expect(canCiteFromAsset(asset({ id: "empty", src: "" }))).toBe(false);
    expect(canCiteFromAsset(asset({ id: "gen", status: "generating" }))).toBe(false);
    expect(canCiteFromAsset(null)).toBe(false);
  });
});

describe("spawnCitedTextNote", () => {
  it("appends a linked text card for 脚本 / 文案 / 规则", () => {
    const parent = asset({ id: "hero", prompt: "修仙模拟像素稿" });
    const result = spawnCitedTextNote(project([parent]), "hero", {
      kind: "script",
      id: "note-1",
      now: "2026-09-17T02:00:00.000Z",
    });
    expect(result).not.toBeNull();
    expect(result!.note).toMatchObject({
      id: "note-1",
      kind: "script",
      title: "脚本",
      body: "",
      parentAssetId: "hero",
      createdAt: "2026-09-17T02:00:00.000Z",
    });
    expect(result!.project.canvasNotes?.map((n) => n.id)).toEqual(["note-1"]);
    expect(result!.project.updatedAt).toBe("2026-09-17T02:00:00.000Z");
  });

  it("returns null when the source image cannot be cited", () => {
    expect(
      spawnCitedTextNote(project([asset({ id: "empty", src: "" })]), "empty", {
        kind: "copy",
      })
    ).toBeNull();
  });
});

describe("spawnCitedImage", () => {
  it("reuses empty child spawn so image cite stays on the same lineage", () => {
    const parent = asset({ id: "hero" });
    const result = spawnCitedImage(project([parent]), "hero", {
      id: "child-1",
      now: "2026-09-17T02:00:00.000Z",
    });
    expect(result?.child).toMatchObject({
      id: "child-1",
      parentAssetId: "hero",
      src: "",
      referenceAssetIds: ["hero"],
    });
  });
});

describe("spawnStandaloneNote", () => {
  it("creates an unbound canvas note for toolbar text", () => {
    const result = spawnStandaloneNote(project([]), {
      kind: "rule",
      id: "n2",
      now: "2026-09-17T03:00:00.000Z",
      x: 120,
      y: 80,
    });
    expect(result.note).toMatchObject({
      id: "n2",
      kind: "rule",
      title: "规则",
      x: 120,
      y: 80,
    });
    expect(result.note.parentAssetId).toBeUndefined();
  });
});

describe("placeCitedNode", () => {
  it("places the new card to the right of the source, stacked by sibling index", () => {
    const first = placeCitedNode({ x: 10, y: 20, w: 200, h: 160 }, 0, 220);
    expect(first).toEqual({ x: 258, y: 20 });
    const second = placeCitedNode({ x: 10, y: 20, w: 200, h: 160 }, 1, 220);
    expect(second.x).toBe(258);
    expect(second.y).toBeGreaterThan(first.y);
  });
});

describe("citePortScreenPosition", () => {
  it("anchors the + control outside the right-middle resize handle", () => {
    const box = { minX: 20, minY: 10, maxX: 220, maxY: 90 };
    const port = citePortScreenPosition(box);
    expect(port.top).toBe(50);
    expect(port.left).toBeGreaterThanOrEqual(box.maxX + 24);
  });
});

describe("isCiteDragGesture", () => {
  it("treats a tiny nudge as a click and a pull as a drag", () => {
    expect(isCiteDragGesture({ x: 40, y: 40 }, { x: 44, y: 41 })).toBe(false);
    expect(isCiteDragGesture({ x: 40, y: 40 }, { x: 80, y: 48 })).toBe(true);
  });
});

describe("cited drop placement", () => {
  it("puts the new card on the pull-drop point instead of auto-stacking", () => {
    const parent = asset({ id: "hero" });
    const result = spawnCitedTextNote(project([parent]), "hero", {
      kind: "copy",
      id: "note-drop",
      now: "2026-09-17T02:00:00.000Z",
      dropAt: { x: 900, y: 410 },
    });
    expect(result?.note).toMatchObject({
      x: 900,
      y: 410 - TEXT_NOTE_DEFAULT_H / 2,
      parentAssetId: "hero",
    });
  });
});

describe("style spec", () => {
  it("uses the newest written spec as the image style", () => {
    const spec = activeStyleSpec([
      {
        id: "old",
        kind: "spec",
        title: "规格",
        body: "旧风格",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "copy",
        kind: "copy",
        title: "文案",
        body: "不要用我",
        createdAt: "2026-10-03T00:00:00.000Z",
      },
      {
        id: "new",
        kind: "spec",
        title: "规格",
        body: "冷灰底，墨黑字",
        adopted: true,
        createdAt: "2026-10-02T00:00:00.000Z",
        updatedAt: "2026-10-04T00:00:00.000Z",
      },
    ]);
    expect(spec).toBe("冷灰底，墨黑字");
    expect(applyStyleSpecToPrompt("招聘雷达首页", spec)).toContain("冷灰底，墨黑字");
    expect(applyStyleSpecToPrompt("招聘雷达首页", undefined)).toBe("招聘雷达首页");
  });

  it("ignores a spec until the user adopts that card", () => {
    const notes = [
      {
        id: "spec-a",
        kind: "spec" as const,
        title: "规格",
        body: "冷灰底，墨黑字",
        parentAssetId: "img-a",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        id: "spec-b",
        kind: "spec" as const,
        title: "规格",
        body: "暖纸色，衬线标题",
        parentAssetId: "img-b",
        createdAt: "2026-10-03T00:00:00.000Z",
      },
    ];
    expect(activeStyleSpec(notes)).toBeUndefined();
    const adopted = adoptStyleNotes(notes, "img-a");
    expect(activeStyleSpec(adopted)).toBe("冷灰底，墨黑字");
    expect(adopted.find((note) => note.id === "spec-b")?.adopted).toBe(false);
  });
});

describe("note labels and composer prompt", () => {
  it("maps kinds to canvas labels", () => {
    expect(noteKindLabel("script")).toBe("脚本");
    expect(noteKindLabel("copy")).toBe("文案");
    expect(noteKindLabel("rule")).toBe("规则");
    expect(noteKindLabel("note")).toBe("笔记");
    expect(noteKindLabel("spec")).toBe("规格");
    expect(defaultTitleForKind("copy")).toBe("文案");
  });

  it("asks the agent to write the cited kind onto the canvas card", () => {
    const prompt = composerPromptForCite({
      kind: "copy",
      noteId: "note-1",
      sourcePrompt: "像素风修仙模拟游戏视觉稿",
    });
    expect(prompt).toContain("文案");
    expect(prompt).toContain("画布");
    expect(prompt).toContain("note-1");
    expect(prompt).not.toContain("upsert_canvas_note");
  });

  it("asks the agent to write project copy onto the card", () => {
    const prompt = composerPromptForTextTask({
      task: "copy",
      noteId: "note-9",
      sourcePrompt: "招聘雷达",
    });
    expect(prompt).toContain("文案");
    expect(prompt).toContain("note-9");
    expect(prompt).toContain("招聘雷达");
    expect(prompt).toContain("画布");
    expect(prompt).not.toContain("策划案");
  });
});

describe("deleteCanvasNote", () => {
  it("removes 脚本 / 文案 / 规则 cards from the project", () => {
    const seeded = spawnCitedTextNote(
      project([asset({ id: "hero" })]),
      "hero",
      { kind: "script", id: "note-1", now: "2026-09-17T02:00:00.000Z" }
    )!;
    const withCopy = spawnCitedTextNote(seeded.project, "hero", {
      kind: "copy",
      id: "note-2",
      now: "2026-09-17T02:01:00.000Z",
    })!;
    const next = deleteCanvasNote(
      withCopy.project,
      "note-1",
      "2026-09-17T05:00:00.000Z"
    );
    expect(next.canvasNotes?.map((n) => n.id)).toEqual(["note-2"]);
    expect(next.updatedAt).toBe("2026-09-17T05:00:00.000Z");
  });
});

describe("persistCanvasNoteLayout", () => {
  it("drops notes whose canvas shapes were deleted", () => {
    const notes = [
      {
        id: "keep",
        kind: "script" as const,
        title: "脚本",
        body: "",
        createdAt: "2026-09-17T02:00:00.000Z",
        updatedAt: "2026-09-17T02:00:00.000Z",
        x: 10,
        y: 20,
        w: 280,
        h: 220,
      },
      {
        id: "gone",
        kind: "rule" as const,
        title: "规则",
        body: "",
        createdAt: "2026-09-17T02:00:00.000Z",
        updatedAt: "2026-09-17T02:00:00.000Z",
        x: 40,
        y: 80,
        w: 280,
        h: 220,
      },
    ];
    const next = persistCanvasNoteLayout(notes, [
      {
        type: "text-note",
        x: 100,
        y: 140,
        props: { noteId: "keep", w: 300, h: 240 },
      },
    ]);
    expect(next).toEqual([
      expect.objectContaining({
        id: "keep",
        x: 100,
        y: 140,
        w: 300,
        h: 240,
      }),
    ]);
  });
});

describe("upsertCanvasNote", () => {
  it("updates body and kind of an existing note", () => {
    const seeded = spawnCitedTextNote(
      project([asset({ id: "hero" })]),
      "hero",
      { kind: "copy", id: "note-1", now: "2026-09-17T02:00:00.000Z" }
    )!;
    const next = upsertCanvasNote(seeded.project, {
      id: "note-1",
      kind: "rule",
      title: "玩法规则",
      body: "每日签到得灵石。",
      now: "2026-09-17T04:00:00.000Z",
    });
    expect(next.canvasNotes?.[0]).toMatchObject({
      id: "note-1",
      kind: "rule",
      title: "玩法规则",
      body: "每日签到得灵石。",
      parentAssetId: "hero",
    });
    expect(next.updatedAt).toBe("2026-09-17T04:00:00.000Z");
  });
});
