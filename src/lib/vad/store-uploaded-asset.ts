import { promises as fs } from "node:fs";
import { join } from "node:path";
import { toSafeAssetFilename } from "./asset-filename";
import { projectDir } from "./paths";

const EXT_SUBTYPE: Record<string, string> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "webp",
  gif: "gif",
  bmp: "bmp",
  avif: "avif",
  svg: "svg+xml",
};

export function mimeSubtypeForUpload(
  mimeType: string | undefined,
  fileName: string
): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return mime.slice("image/".length);
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_SUBTYPE[ext] ?? "png";
}

export function uploadedAssetPublicSrc(projectId: string, filename: string): string {
  return `/api/assets/${projectId}/assets/${filename}`;
}

export async function storeUploadedCanvasImage(input: {
  projectId: string;
  assetId: string;
  fileName: string;
  mimeType?: string;
  bytes: Buffer;
  title?: string;
}): Promise<{ src: string; filename: string }> {
  const subtype = mimeSubtypeForUpload(input.mimeType, input.fileName);
  const filename = toSafeAssetFilename(input.assetId, subtype, input.title);
  const dir = join(projectDir(input.projectId), "assets");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, filename), input.bytes);
  return { filename, src: uploadedAssetPublicSrc(input.projectId, filename) };
}
