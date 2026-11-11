import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUsableReferenceImage } from "@/lib/agents/tools/utils";

const tempRoot = { current: "" };

vi.mock("@/lib/vad/paths", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/vad/paths")>();
  return {
    ...orig,
    projectDir: (projectId: string) => join(tempRoot.current, projectId),
  };
});

describe("storeUploadedCanvasImage", () => {
  beforeEach(async () => {
    tempRoot.current = await mkdtemp(join(tmpdir(), "vad-upload-"));
  });

  afterEach(async () => {
    await rm(tempRoot.current, { recursive: true, force: true });
  });

  it("writes a dropped canvas image into the project assets folder", async () => {
    const { storeUploadedCanvasImage } = await import("./store-uploaded-asset");
    const bytes = Buffer.from("png-bytes");
    const stored = await storeUploadedCanvasImage({
      projectId: "uF05YnuA7o",
      assetId: "upl_drop1",
      fileName: "hero.png",
      mimeType: "",
      bytes,
      title: "hero",
    });

    expect(stored.src).toBe("/api/assets/uF05YnuA7o/assets/hero-upl_drop1.png");
    expect(isUsableReferenceImage(stored.src)).toBe(true);
    const disk = await readFile(
      join(tempRoot.current, "uF05YnuA7o", "assets", "hero-upl_drop1.png")
    );
    expect(disk.equals(bytes)).toBe(true);
  });
});
