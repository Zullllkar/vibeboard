import { describe, expect, it } from "vitest";
import type { ProjectFile } from "@/lib/project/schema";
import {
  addWebsiteFrame,
  attachAcceptanceFrame,
  normalizeWebsiteUrl,
  useThisWebsite,
  websiteSpecDraft,
} from "./website-frame";

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

describe("normalizeWebsiteUrl", () => {
  it("accepts http(s) addresses and rejects anything else", () => {
    expect(normalizeWebsiteUrl("https://example.com/app")).toBe("https://example.com/app");
    expect(normalizeWebsiteUrl("localhost:5173/dashboard")).toBe(
      "https://localhost:5173/dashboard"
    );
    expect(normalizeWebsiteUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeWebsiteUrl("")).toBeUndefined();
  });
});

describe("addWebsiteFrame", () => {
  it("puts a website frame on the project", () => {
    const next = addWebsiteFrame(project(), {
      url: "http://127.0.0.1:5173",
      x: 10,
      y: 20,
    });
    expect(next?.websiteFrames).toHaveLength(1);
    expect(next?.websiteFrames?.[0]?.url).toBe("http://127.0.0.1:5173/");
    expect(next?.websiteFrames?.[0]?.x).toBe(10);
  });

  it("uses the page screenshot as the reference and does not bind a skill off 界面视觉", () => {
    const withFrame = addWebsiteFrame(
      {
        ...project(),
        targetId: "promo-kv",
        assets: [
          {
            id: "shot-1",
            prompt: "网站截图",
            src: "/api/assets/p/assets/shot-1.png",
            width: 960,
            height: 640,
            model: "upload",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "candidate",
            source: "uploaded",
          },
        ],
      },
      { url: "https://example.com", x: 0, y: 0 }
    );
    const frameId = withFrame?.websiteFrames?.[0]?.id ?? "";
    const marked = {
      ...withFrame!,
      websiteFrames: [{ ...withFrame!.websiteFrames![0]!, shotAssetId: "shot-1" }],
    };
    const next = useThisWebsite(marked, frameId);
    expect(next?.designDirection?.styleSourceAssetId).toBe("shot-1");
    expect(next?.skillId).toBeUndefined();
    expect(next?.canvasNotes?.some((note) => note.kind === "spec" && note.parentAssetId === "shot-1")).toBe(
      true
    );
    expect(websiteSpecDraft("https://example.com/")).toContain("https://example.com/");
    expect(useThisWebsite(withFrame!, frameId)).toBeNull();
  });

  it("places the running page beside the chosen 界面视觉 draft", () => {
    const base = {
      ...project(),
      targetId: "ui-visual" as const,
      skillId: "web-prototype",
      designDirection: {
        summary: "已选定",
        moodKeywords: ["ink"],
        styleSourceAssetId: "draft-1",
      },
    };
    const next = attachAcceptanceFrame(base, {
      assetId: "draft-1",
      url: "http://127.0.0.1:5173",
      beside: { x: 100, y: 40, w: 320, h: 240 },
    });
    expect(next.websiteFrames).toHaveLength(1);
    expect(next.websiteFrames?.[0]?.url).toBe("http://127.0.0.1:5173/");
    expect(next.websiteFrames?.[0]?.purpose).toBe("acceptance");
    expect(next.websiteFrames?.[0]?.acceptanceAssetId).toBe("draft-1");
    expect(next.websiteFrames?.[0]?.x).toBeGreaterThan(100);
    expect(next.designDirection?.styleSourceAssetId).toBe("draft-1");
    expect(next.skillId).toBe("web-prototype");
    expect(attachAcceptanceFrame(next, { assetId: "draft-1", url: "http://127.0.0.1:5173" })).toBe(next);
    expect(
      attachAcceptanceFrame(
        { ...base, targetId: "game-art" },
        { assetId: "draft-1", url: "http://127.0.0.1:5173" }
      ).websiteFrames
    ).toBeUndefined();
    expect(attachAcceptanceFrame(base, { assetId: "draft-1", url: "" })).toBe(base);
    const unadopted = { ...base, designDirection: undefined };
    expect(attachAcceptanceFrame(unadopted, { assetId: "draft-1", url: "http://127.0.0.1:5173" })).toBe(
      unadopted
    );
    const acceptance = useThisWebsite(
      {
        ...next,
        assets: [
          {
            id: "shot-1",
            prompt: "网站截图",
            src: "/api/assets/p/assets/shot-1.png",
            width: 960,
            height: 640,
            model: "upload",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "candidate",
            source: "uploaded",
          },
        ],
        websiteFrames: [{ ...next.websiteFrames![0]!, shotAssetId: "shot-1" }],
      },
      next.websiteFrames![0]!.id
    );
    expect(acceptance).toBeNull();
  });

  it("does not add a frame when the address is empty", () => {
    expect(addWebsiteFrame(project(), { url: "   ", x: 0, y: 0 })).toBeNull();
  });
});
