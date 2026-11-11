import type { ImageAsset } from "@/lib/project/assets-schema";
import { isEmptySpawnSlot } from "./spawn-child-asset";

function waitingEmptySlots(assets: ImageAsset[]): ImageAsset[] {
  return assets
    .filter((asset) => {
      if (!isEmptySpawnSlot(asset)) return false;
      const status = asset.status ?? "candidate";
      return (
        status !== "discarded" &&
        status !== "failed" &&
        status !== "cancelled" &&
        status !== "generating"
      );
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 空占位数量限制确认/执行的画面数；用户明确要求更多张时不截断。 */
export function fitImagePromptsToEmptySlots(input: {
  prompts: string[];
  assets: ImageAsset[];
  requestedCount?: number;
}): { prompts: string[]; parentAssetId?: string } {
  const prompts = input.prompts.filter(Boolean);
  const slots = waitingEmptySlots(input.assets);
  if (slots.length === 0) return { prompts };
  if (
    input.requestedCount != null &&
    input.requestedCount > slots.length
  ) {
    return { prompts };
  }
  const fitted = prompts.slice(0, slots.length);
  const used = slots.slice(0, Math.max(fitted.length, 1));
  const parents = [
    ...new Set(
      used
        .map((slot) => slot.parentAssetId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  return {
    prompts: fitted.length > 0 ? fitted : prompts,
    parentAssetId: parents.length === 1 ? parents[0] : undefined,
  };
}
