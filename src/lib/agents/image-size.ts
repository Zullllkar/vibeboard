export type ImageSizeRequest =
  | { mode: "auto" }
  | { mode: "fixed"; width: number; height: number; size: string };

const SIZE_TOKEN = /(\d{3,4})\s*[x×*]\s*(\d{3,4})/i;

export function imageSizeFromUserText(text: string): ImageSizeRequest | null {
  const match = text.match(SIZE_TOKEN);
  if (!match) return null;
  const normalized = normalizeOfficialImageSize(Number(match[1]), Number(match[2]));
  return {
    mode: "fixed",
    width: normalized.width,
    height: normalized.height,
    size: `${normalized.width}x${normalized.height}`,
  };
}

/** 深度智算 / tt-image：边长为 16 的倍数，宽高比 1:3–3:1，像素落在官方范围内。 */
export function normalizeOfficialImageSize(
  width: number,
  height: number
): { width: number; height: number } {
  let w = round16(width);
  let h = round16(height);
  const ratio = w / Math.max(1, h);
  if (ratio > 3) w = round16(h * 3);
  if (ratio < 1 / 3) h = round16(w * 3);
  w = clampEdge(w);
  h = clampEdge(h);

  let pixels = w * h;
  if (pixels > 8_294_400) {
    const scale = Math.sqrt(8_294_400 / pixels);
    w = clampEdge(round16(w * scale));
    h = clampEdge(round16(h * scale));
    pixels = w * h;
  }
  if (pixels < 655_360) {
    const scale = Math.sqrt(655_360 / Math.max(1, pixels));
    w = clampEdge(round16(w * scale));
    h = clampEdge(round16(h * scale));
  }
  return { width: w, height: h };
}

export function resolveImageSizeRequest(input: {
  userMessage?: string;
  sizeMode?: unknown;
  width?: unknown;
  height?: unknown;
  preferredSize?: { width?: unknown; height?: unknown };
}): ImageSizeRequest {
  if (input.sizeMode === "auto") return { mode: "auto" };
  if (input.sizeMode === "fixed") {
    const width = Number(input.width);
    const height = Number(input.height);
    if (width > 0 && height > 0) {
      const normalized = normalizeOfficialImageSize(width, height);
      return {
        mode: "fixed",
        width: normalized.width,
        height: normalized.height,
        size: `${normalized.width}x${normalized.height}`,
      };
    }
  }
  const fromText = imageSizeFromUserText(input.userMessage ?? "");
  if (fromText) return fromText;
  const prefWidth = Number(input.preferredSize?.width);
  const prefHeight = Number(input.preferredSize?.height);
  if (prefWidth > 0 && prefHeight > 0) {
    const normalized = normalizeOfficialImageSize(prefWidth, prefHeight);
    return {
      mode: "fixed",
      width: normalized.width,
      height: normalized.height,
      size: `${normalized.width}x${normalized.height}`,
    };
  }
  return { mode: "auto" };
}

function round16(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 16;
  return Math.max(16, Math.round(value / 16) * 16);
}

function clampEdge(value: number): number {
  return Math.max(16, Math.min(3840, value));
}
