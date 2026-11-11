import { describe, expect, it } from "vitest";
import type { ImageAsset } from "./assets-schema";
import { mergeProjectWithDisk } from "./merge-project";
import type { ProjectFile } from "./schema";

function project(partial: Partial<ProjectFile> & { assets: ImageAsset[] }): ProjectFile {
  return {
    id: "p",
    slug: "p",
    title: "P",
    rawIdea: "idea",
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-10-26T00:00:00.000Z",
    pages: [],
    ...partial,
  } as ProjectFile;
}

function image(status: ImageAsset["status"], src: string): ImageAsset {
  return {
    id: "a1",
    prompt: "p",
    src,
    width: 100,
    height: 100,
    model: "tt-image-2.5",
    createdAt: "2026-10-26T04:44:52.529Z",
    status,
  };
}

describe("mergeProjectWithDisk", () => {
  it("keeps a newer disk copy of the same finished image visible", () => {
    const src = "/api/assets/p/assets/a1.png";
    const local = project({
      updatedAt: "2026-10-26T04:59:00.000Z",
      assets: [image("discarded", src)],
    });
    const disk = project({
      updatedAt: "2026-10-26T05:01:00.000Z",
      assets: [image("candidate", src)],
    });
    const merged = mergeProjectWithDisk(local, disk);
    expect(merged.assets?.[0]?.status).toBe("candidate");
  });

  it("keeps an unsaved local delete when the disk copy is older", () => {
    const src = "/api/assets/p/assets/a1.png";
    const local = project({
      updatedAt: "2026-10-26T05:02:00.000Z",
      assets: [image("discarded", src)],
    });
    const disk = project({
      updatedAt: "2026-10-26T05:01:00.000Z",
      assets: [image("candidate", src)],
    });
    const merged = mergeProjectWithDisk(local, disk);
    expect(merged.assets?.[0]?.status).toBe("discarded");
  });
});
