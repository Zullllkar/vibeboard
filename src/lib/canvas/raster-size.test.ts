import { describe, expect, it } from "vitest";

import { readRasterSize, readRasterSizeFromDataUrl } from "./raster-size";

describe("readRasterSize", () => {
  it("reads PNG IHDR dimensions", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    bytes[16] = 0x00;
    bytes[17] = 0x00;
    bytes[18] = 0x0f;
    bytes[19] = 0x00;
    bytes[20] = 0x00;
    bytes[21] = 0x00;
    bytes[22] = 0x08;
    bytes[23] = 0x70;
    expect(readRasterSize(bytes)).toEqual({ width: 3840, height: 2160 });
  });

  it("reads a data URL without treating the request size as the file size", () => {
    const bytes = Buffer.alloc(24);
    bytes.writeUInt32BE(0x89504e47, 0);
    bytes[4] = 0x0d;
    bytes[5] = 0x0a;
    bytes[6] = 0x1a;
    bytes[7] = 0x0a;
    bytes.writeUInt32BE(1254, 16);
    bytes.writeUInt32BE(1254, 20);
    const src = `data:image/png;base64,${bytes.toString("base64")}`;
    expect(readRasterSizeFromDataUrl(src)).toEqual({ width: 1254, height: 1254 });
  });
});
