/**
 * 合并内存项目与磁盘/API 脱脂版本，避免异步 POST 乱序覆盖 assets。
 * @author：wangjunhua
 */

import { isPersistedImageSrc, mergeAssetsPreferDiscarded } from "./asset-visibility";
import type { ImageAsset } from "./assets-schema";
import type { ProjectFile } from "./schema";

function reviveSameImageFromNewerDisk(
  merged: ImageAsset[],
  diskAssets: ImageAsset[] | undefined
): ImageAsset[] {
  const diskById = new Map((diskAssets ?? []).map((asset) => [asset.id, asset]));
  let changed = false;
  const next = merged.map((asset) => {
    const remote = diskById.get(asset.id);
    if (!remote) return asset;
    if (
      asset.status === "discarded" &&
      remote.status !== "discarded" &&
      remote.status !== "failed" &&
      remote.status !== "cancelled" &&
      remote.src === asset.src &&
      isPersistedImageSrc(remote.src)
    ) {
      changed = true;
      return { ...asset, status: remote.status ?? "candidate" };
    }
    return asset;
  });
  return changed ? next : merged;
}

/** 用磁盘/API 路径替换同 id 资产的 base64 src（体积更小） */
export function mergeApiSrcFromDisk(
  local: ProjectFile,
  disk: ProjectFile
): ProjectFile {
  const diskMap = new Map((disk.assets ?? []).map((a) => [a.id, a]));
  const assets = (local.assets ?? []).map((a) => {
    const d = diskMap.get(a.id);
    if (d?.src?.startsWith("/api/") && a.src?.startsWith("data:")) {
      return { ...a, src: d.src };
    }
    return a;
  });
  return { ...local, assets };
}

/**
 * 磁盘较旧但内存更新时：保留内存 pages/assets，仅合并 API src。
 * 磁盘较新时：以磁盘为准，但保留本地 discarded，避免刷新后「删掉的又回来」。
 */
export function mergeProjectWithDisk(
  local: ProjectFile,
  disk: ProjectFile
): ProjectFile {
  if (local.updatedAt > disk.updatedAt) {
    return mergeApiSrcFromDisk(local, disk);
  }

  const localAssetCount = local.assets?.length ?? 0;
  const diskAssetCount = disk.assets?.length ?? 0;
  if (localAssetCount > diskAssetCount) {
    return mergeApiSrcFromDisk(
      {
        ...disk,
        assets: reviveSameImageFromNewerDisk(
          mergeAssetsPreferDiscarded(local.assets, disk.assets),
          disk.assets
        ),
        pages: local.pages,
        canvasNotes: local.canvasNotes ?? disk.canvasNotes,
      },
      disk
    );
  }

  return {
    ...disk,
    assets: reviveSameImageFromNewerDisk(
      mergeAssetsPreferDiscarded(local.assets, disk.assets),
      disk.assets
    ),
    pages: local.pages?.length ? local.pages : disk.pages,
    canvasSnapshot: disk.canvasSnapshot ?? local.canvasSnapshot,
    canvasNotes: disk.canvasNotes ?? local.canvasNotes,
  };
}
