import { describe, expect, it, vi } from "vitest";
import type { ProjectFile } from "@/lib/project/schema";
import { resolveTaskReferenceImages } from "./reference-resolver";

function projectWithRefs(
  refs: Array<{ id: string; label: string; src: string; createdAt: string }>,
): ProjectFile {
  return {
    id: "p1",
    title: "Demo",
    slug: "demo",
    rawIdea: "idea",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [],
    outputTargets: ["cursor"],
    references: refs.map((ref) => ({
      ...ref,
      width: 100,
      height: 100,
      source: "clipboard" as const,
    })),
  } as ProjectFile;
}

const project = projectWithRefs([
  {
    id: "brand",
    label: "brand.png",
    src: "data:image/png;base64,brand",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "other",
    label: "other.png",
    src: "data:image/png;base64,other",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
]);

describe("resolveTaskReferenceImages", () => {
  it("uses global references when the task cites none", async () => {
    const resolveImages = vi.fn(async (srcs: string[]) => srcs);
    const result = await resolveTaskReferenceImages({
      project,
      projectId: "p1",
      taskReferenceIds: [],
      globalReferenceImages: ["global-a", "global-a", "global-b"],
      resolveImages,
    });

    expect(resolveImages).not.toHaveBeenCalled();
    expect(result).toEqual(["global-a", "global-b"]);
  });

  it("uses task references exclusively when they resolve", async () => {
    const resolveImages = vi.fn(async (srcs: string[]) => srcs.map((src) => `resolved:${src}`));
    const result = await resolveTaskReferenceImages({
      project,
      projectId: "p1",
      taskReferenceIds: ["brand"],
      globalReferenceImages: ["global-a"],
      resolveImages,
    });

    expect(resolveImages).toHaveBeenCalledWith(["data:image/png;base64,brand"], "p1");
    expect(result).toEqual(["resolved:data:image/png;base64,brand"]);
  });

  it("falls back to global references when cited ids are missing", async () => {
    const resolveImages = vi.fn(async (srcs: string[]) => srcs);
    const result = await resolveTaskReferenceImages({
      project,
      projectId: "p1",
      taskReferenceIds: ["missing"],
      globalReferenceImages: ["global-a"],
      resolveImages,
    });

    expect(result).toEqual(["global-a"]);
  });

  it("dedupes and caps task references", async () => {
    const resolveImages = vi.fn(async (srcs: string[]) => [...srcs, ...srcs]);
    const result = await resolveTaskReferenceImages({
      project,
      projectId: "p1",
      taskReferenceIds: ["brand"],
      globalReferenceImages: [],
      max: 2,
      resolveImages,
    });

    expect(result).toEqual(["data:image/png;base64,brand"]);
  });
});
