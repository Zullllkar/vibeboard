/**
 * 生成图可能先落在应用数据目录，之后项目才绑定到用户工作区。
 * 读取时工作区优先，缺文件再回退到应用数据目录。
 */

import { access } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { projectDir, VAD_PROJECTS_DIR } from "./paths";

const SAFE_SEGMENT = /[^a-zA-Z0-9._-]/g;

export function assetContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

export function containedAssetPath(
  root: string,
  subFolder: string,
  filename: string
): string | null {
  if (subFolder !== "assets" && subFolder !== "references") return null;
  const safeName = filename.replace(SAFE_SEGMENT, "");
  if (!safeName || safeName !== filename) return null;
  const rootResolved = resolve(root);
  const filePath = resolve(join(rootResolved, subFolder, safeName));
  const rel = relative(rootResolved, filePath);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return filePath;
}

export async function locateStoredAssetFile(input: {
  activeDir: string;
  legacyDir?: string;
  subFolder: string;
  filename: string;
}): Promise<string | null> {
  const dirs = [input.activeDir];
  if (
    input.legacyDir &&
    resolve(input.legacyDir) !== resolve(input.activeDir)
  ) {
    dirs.push(input.legacyDir);
  }
  for (const dir of dirs) {
    const filePath = containedAssetPath(dir, input.subFolder, input.filename);
    if (!filePath) return null;
    try {
      await access(filePath);
      return filePath;
    } catch {
      /* try the next directory */
    }
  }
  return null;
}

export async function locateProjectAssetFile(
  projectId: string,
  subFolder: string,
  filename: string
): Promise<string | null> {
  const safeId = projectId.replace(SAFE_SEGMENT, "");
  if (!safeId || safeId !== projectId) return null;
  return locateStoredAssetFile({
    activeDir: projectDir(safeId),
    legacyDir: join(VAD_PROJECTS_DIR, safeId),
    subFolder,
    filename,
  });
}
