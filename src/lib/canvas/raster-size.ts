export function readRasterSizeFromDataUrl(
  src: string
): { width: number; height: number } | null {
  const match = src.match(/^data:image\/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)/i);
  if (!match) return null;
  const bytes = Buffer.from(match[1].replace(/\s/g, "").slice(0, 160000), "base64");
  return readRasterSize(bytes);
}

export function readRasterSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = readU32(bytes, 16);
    const height = readU32(bytes, 20);
    return positive(width, height);
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = readU16(bytes, offset + 5);
        const width = readU16(bytes, offset + 7);
        return positive(width, height);
      }
      const length = readU16(bytes, offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

function positive(width: number, height: number): { width: number; height: number } | null {
  if (width < 1 || height < 1 || width > 20000 || height > 20000) return null;
  return { width, height };
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}
