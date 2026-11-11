import { describe, expect, it } from "vitest";

import {
  imageSizeFromUserText,
  normalizeOfficialImageSize,
  resolveImageSizeRequest,
} from "./image-size";

describe("resolveImageSizeRequest", () => {
  it("uses auto when the user did not write a pixel size", () => {
    expect(resolveImageSizeRequest({ userMessage: "做一张招聘雷达落地页，16:9" })).toEqual({
      mode: "auto",
    });
  });

  it("keeps a pixel size the user wrote, snapped to the official 16-pixel grid", () => {
    expect(imageSizeFromUserText("封面 1920x1080")).toEqual({
      mode: "fixed",
      width: 1920,
      height: 1088,
      size: "1920x1088",
    });
    expect(normalizeOfficialImageSize(1536, 864)).toEqual({ width: 1536, height: 864 });
  });

  it("lets a confirmed card choose auto even if the message also contains a size", () => {
    expect(
      resolveImageSizeRequest({
        userMessage: "输出 1536x864",
        sizeMode: "auto",
        width: 1536,
        height: 864,
      })
    ).toEqual({ mode: "auto" });
  });

  it("uses the size chosen on the confirmation card", () => {
    expect(
      resolveImageSizeRequest({
        userMessage: "做一张图",
        sizeMode: "fixed",
        width: 1024,
        height: 1536,
      })
    ).toMatchObject({ mode: "fixed", width: 1024, height: 1536, size: "1024x1536" });
  });
});
