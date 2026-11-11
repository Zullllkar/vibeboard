import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";

import { locateStoredAssetFile } from "./stored-asset-path";

describe("locateStoredAssetFile", () => {
  let root = "";

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("reads a generated png from the app data dir when the workspace sidecar has none", async () => {
    root = await mkdtemp(join(tmpdir(), "vad-asset-locate-"));
    const active = join(root, "workspace-sidecar");
    const legacy = join(root, "app-projects", "uF05YnuA7o");
    const filename = "pending-direct-d71469c807-0.png";
    await mkdir(join(legacy, "assets"), { recursive: true });
    await writeFile(join(legacy, "assets", filename), Buffer.from("png-bytes"));

    const found = await locateStoredAssetFile({
      activeDir: active,
      legacyDir: legacy,
      subFolder: "assets",
      filename,
    });

    expect(found).toBe(join(legacy, "assets", filename));
  });

  it("prefers the workspace copy when both copies exist", async () => {
    root = await mkdtemp(join(tmpdir(), "vad-asset-locate-"));
    const active = join(root, "workspace-sidecar");
    const legacy = join(root, "app-projects", "uF05YnuA7o");
    const filename = "hero.png";
    await mkdir(join(active, "assets"), { recursive: true });
    await mkdir(join(legacy, "assets"), { recursive: true });
    await writeFile(join(active, "assets", filename), Buffer.from("workspace"));
    await writeFile(join(legacy, "assets", filename), Buffer.from("legacy"));

    const found = await locateStoredAssetFile({
      activeDir: active,
      legacyDir: legacy,
      subFolder: "assets",
      filename,
    });

    expect(found).toBe(join(active, "assets", filename));
  });

  it("rejects a filename that leaves the project directory", async () => {
    root = await mkdtemp(join(tmpdir(), "vad-asset-locate-"));
    const active = join(root, "active");
    await mkdir(active, { recursive: true });
    await writeFile(join(active, "secret.png"), Buffer.from("secret"));

    const found = await locateStoredAssetFile({
      activeDir: active,
      legacyDir: join(root, "legacy"),
      subFolder: "assets",
      filename: "../secret.png",
    });
    expect(found).toBeNull();
  });
});
