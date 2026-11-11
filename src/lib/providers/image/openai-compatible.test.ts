import { describe, expect, it } from "vitest";

import {
  attachReferenceImagesToBody,
  imageApiSize,
  resolveImageApiPath,
  resolveImageEndpoint,
  shouldFallbackToGenerations,
  shouldRetryEditsAsMultipart,
  shouldRetryImageHttp,
} from "./openai-compatible";

describe("imageApiSize", () => {
  it("sends auto when the user did not choose a pixel size", () => {
    expect(imageApiSize(1024, 1024, "tt-image-2.5", "auto")).toBe("auto");
    expect(imageApiSize(1024, 1024, "gpt-image-1", "auto")).toBe("auto");
    expect(imageApiSize(1024, 1024, "dall-e-3", "auto")).toBe("1024x1024");
  });

  it("sends an explicit frame to custom models and official buckets to OpenAI", () => {
    expect(imageApiSize(1536, 864, "tt-image-2.5", "1536x864")).toBe("1536x864");
    expect(imageApiSize(1536, 864, "dall-e-3", "1536x864")).toBe("1792x1024");
    expect(imageApiSize(1536, 864, "gpt-image-1", "1536x864")).toBe("1536x1024");
  });
});

describe("attachReferenceImagesToBody", () => {
  it("adds image and images for usable references", () => {
    const body: Record<string, unknown> = { prompt: "hero" };
    attachReferenceImagesToBody(body, [
      "data:image/png;base64,abc",
      "https://cdn.example/ref.jpg",
      "data:image/svg+xml,noop",
    ]);
    expect(body.image).toBe("data:image/png;base64,abc");
    expect(body.images).toEqual([
      "data:image/png;base64,abc",
      "https://cdn.example/ref.jpg",
    ]);
  });

  it("leaves body unchanged without usable references", () => {
    const body: Record<string, unknown> = { prompt: "hero" };
    attachReferenceImagesToBody(body, ["/api/assets/p/assets/a.png"]);
    expect(body.image).toBeUndefined();
  });
});

describe("resolveImageEndpoint", () => {
  it("keeps an OpenAI-compatible /v1 root and appends the image path", () => {
    expect(resolveImageEndpoint("https://api.openai.com/v1", "/images/generations")).toBe(
      "https://api.openai.com/v1/images/generations"
    );
    expect(resolveImageEndpoint("https://api.lk888.ai/v1", "/images/generations")).toBe(
      "https://api.lk888.ai/v1/images/generations"
    );
  });

  it("does not append another segment when the saved base is already the generate endpoint", () => {
    expect(
      resolveImageEndpoint(" https://api.lk888.ai/v1/media/generate", "/images/generations")
    ).toBe("https://api.lk888.ai/v1/images/generations");
    expect(
      resolveImageEndpoint("https://api.lk888.ai/v1/images/generations/", "/images/edits")
    ).toBe("https://api.lk888.ai/v1/images/edits");
  });
});

describe("image API path for references", () => {
  it("uses edits when a reference image is present", () => {
    expect(resolveImageApiPath(true)).toBe("/images/edits");
    expect(resolveImageApiPath(false)).toBe("/images/generations");
  });

  it("falls back to generations only when edits is missing", () => {
    expect(shouldFallbackToGenerations(404)).toBe(true);
    expect(shouldFallbackToGenerations(405)).toBe(true);
    expect(shouldFallbackToGenerations(400)).toBe(false);
  });

  it("retries official OpenAI-style multipart after JSON edits reject", () => {
    expect(shouldRetryEditsAsMultipart(400)).toBe(true);
    expect(shouldRetryEditsAsMultipart(404)).toBe(false);
  });
});

describe("shouldRetryImageHttp", () => {
  it("retries rate limits only, never timeouts or 5xx after POST", () => {
    const timeout = new Error("timeout after 180000ms");
    const rate = new Error("HTTP 429: busy") as Error & { status?: number };
    rate.status = 429;
    const server = new Error("HTTP 502: bad gateway") as Error & { status?: number };
    server.status = 502;
    expect(shouldRetryImageHttp(timeout)).toBe(false);
    expect(shouldRetryImageHttp(rate)).toBe(true);
    expect(shouldRetryImageHttp(server)).toBe(false);
  });
});
