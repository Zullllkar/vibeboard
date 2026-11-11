import type { ImageGenerateInput, ImageProvider } from "./types";
import { fetchWithRetry } from "@/lib/providers/fetch-with-retry";
import {
  isGptImageModel,
  type OpenAIImageConfig,
} from "./openai-image-types";

/**
 * OpenAI 兼容 Image Provider（仅服务端）
 * --------------------------------------------------------------
 * 通过 /v1/images/generations 与 OpenAI / 通义 / SiliconFlow 等对话。
 * 类型与 isGptImageModel 见 openai-image-types.ts（客户端可导入）。
 *
 * @author：wangjunhua
 */

export type {
  OpenAIImageQuality,
  OpenAIImageOutputFormat,
  OpenAIImageBackground,
  OpenAIImageConfig,
} from "./openai-image-types";
export { isGptImageModel } from "./openai-image-types";

export function createOpenAICompatibleImageProvider(
  cfg: OpenAIImageConfig
): ImageProvider {
  return {
    name: `openai-image::${shortHost(cfg.baseURL)}::${cfg.model}`,
    async generateImage(input: ImageGenerateInput) {
      const startedAt = Date.now();
      const gptImage = isGptImageModel(cfg.model);
      const size = input.size
        ? imageApiSize(input.width, input.height, cfg.model, input.size)
        : (cfg.defaultSize ?? imageApiSize(input.width, input.height, cfg.model, "auto"));
      const usableRefs = pickUsableReferenceImages(input.referenceImages);

      const body: Record<string, unknown> = {
        model: cfg.model,
        prompt: input.prompt,
        size,
        n: 1,
        response_format: "b64_json",
      };
      if (gptImage) {
        body.quality = cfg.quality ?? "auto";
        body.output_format = cfg.outputFormat ?? "png";
        // gpt-image-2 不支持 transparent background（OpenAI 官方文档）
        if (!/^gpt-image-2/i.test(cfg.model)) {
          body.background = cfg.background ?? "auto";
        }
      }
      if (input.negativePrompt) {
        // 仅部分服务接受；OpenAI 官方不识别此字段会忽略
        body.negative_prompt = input.negativePrompt;
      }
      attachReferenceImagesToBody(body, usableRefs);

      const res = await postImageApi(cfg, body, usableRefs, input.signal);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Image HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = (await res.json()) as ImageGenerationResponse;
      const item = data.data?.[0];
      if (!item) throw new Error("Image response empty");

      let imageUrl: string;
      if (item.b64_json) {
        imageUrl = `data:image/png;base64,${item.b64_json}`;
      } else if (item.url) {
        // 远端 URL：客户端可直接 <img src> 显示
        imageUrl = item.url;
      } else {
        throw new Error("Image response missing b64_json/url");
      }

      return {
        imageUrl,
        model: cfg.model,
        seed: item.seed != null ? String(item.seed) : undefined,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

interface ImageGenerationResponse {
  data?: Array<{
    /** OpenAI 风格：base64 PNG（无 data URL 头） */
    b64_json?: string;
    /** 部分服务直接给托管 URL */
    url?: string;
    /** 部分服务返回 seed */
    seed?: number | string;
    revised_prompt?: string;
  }>;
}

export function pickUsableReferenceImages(
  referenceImages?: string[]
): string[] {
  return (referenceImages ?? []).filter(
    (src) =>
      (src.startsWith("data:image/") && !src.startsWith("data:image/svg+xml")) ||
      /^https?:\/\//i.test(src)
  );
}

export function resolveImageApiPath(
  hasReferenceImages: boolean
): "/images/edits" | "/images/generations" {
  return hasReferenceImages ? "/images/edits" : "/images/generations";
}

/**
 * 用户有时把完整生图地址填进 Base URL（例如 /v1/media/generate）。
 * 这里先收回根路径，再接 OpenAI 兼容的 /images/*，避免拼出 /media/generate/images/generations。
 */
export function resolveImageEndpoint(
  baseURL: string,
  suffix: "/images/generations" | "/images/edits"
): string {
  const trimmed = baseURL.trim();
  try {
    const url = new URL(trimmed);
    const path = url.pathname
      .replace(/\/+$/, "")
      .replace(/\/(?:images\/generations|images\/edits|media\/generate)$/, "");
    return `${url.origin}${path}${suffix}`;
  } catch {
    return trimmed.replace(/\/+$/, "") + suffix;
  }
}

export function shouldFallbackToGenerations(status: number): boolean {
  return status === 404 || status === 405;
}

export function shouldRetryEditsAsMultipart(status: number): boolean {
  return status === 400 || status === 415 || status === 422;
}

/** 生图 POST 非幂等：超时/5xx 后重试会在服务商侧再出一张图。只重试明确的 429。 */
export function shouldRetryImageHttp(err: unknown): boolean {
  const status = (err as Error & { status?: number }).status;
  return status === 429;
}

const IMAGE_HTTP_TIMEOUT_MS = 480_000;
const IMAGE_HTTP_RETRY = {
  timeoutMs: IMAGE_HTTP_TIMEOUT_MS,
  maxAttempts: 3,
  shouldRetry: shouldRetryImageHttp,
} as const;

export function attachReferenceImagesToBody(
  body: Record<string, unknown>,
  referenceImages?: string[]
): void {
  const usable = pickUsableReferenceImages(referenceImages);
  if (usable.length === 0) return;
  body.image = usable[0];
  body.images = usable;
}

async function postImageApi(
  cfg: OpenAIImageConfig,
  body: Record<string, unknown>,
  usableRefs: string[],
  signal?: AbortSignal
): Promise<Response> {
  const authHeaders = { authorization: `Bearer ${cfg.apiKey}` };
  const jsonHeaders = {
    ...authHeaders,
    "content-type": "application/json",
  };
  const editsUrl = resolveImageEndpoint(cfg.baseURL, "/images/edits");
  const generationsUrl = resolveImageEndpoint(cfg.baseURL, "/images/generations");
  const primaryUrl = usableRefs.length > 0 ? editsUrl : generationsUrl;

  let res = await fetchWithRetry(
    primaryUrl,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(body),
      signal,
    },
    { ...IMAGE_HTTP_RETRY, signal }
  );

  if (
    usableRefs.length > 0 &&
    !res.ok &&
    shouldFallbackToGenerations(res.status)
  ) {
    res = await fetchWithRetry(
      generationsUrl,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
        signal,
      },
      { ...IMAGE_HTTP_RETRY, signal }
    );
  }

  if (
    usableRefs.length > 0 &&
    !res.ok &&
    shouldRetryEditsAsMultipart(res.status)
  ) {
    const form = buildEditsFormData(body, usableRefs);
    if (form) {
      res = await fetchWithRetry(
        editsUrl,
        {
          method: "POST",
          headers: authHeaders,
          body: form,
          signal,
        },
        { ...IMAGE_HTTP_RETRY, signal }
      );
    }
  }

  return res;
}

function buildEditsFormData(
  body: Record<string, unknown>,
  usableRefs: string[]
): FormData | null {
  const file = dataUrlToFile(usableRefs[0]);
  if (!file) return null;
  const form = new FormData();
  form.append("image", file);
  form.append("prompt", String(body.prompt ?? ""));
  form.append("model", String(body.model ?? ""));
  if (body.size) form.append("size", String(body.size));
  if (body.n != null) form.append("n", String(body.n));
  if (body.response_format) {
    form.append("response_format", String(body.response_format));
  }
  if (body.quality) form.append("quality", String(body.quality));
  if (body.output_format) form.append("output_format", String(body.output_format));
  return form;
}

function dataUrlToFile(src: string | undefined): File | null {
  if (!src) return null;
  const match = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  return new File([bytes], "reference.png", { type: match[1] });
}

function shortHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

export function imageApiSize(
  w: number,
  h: number,
  model: string,
  requested = "auto"
): string {
  if (!requested || requested === "auto") {
    return /dall-e/i.test(model) ? "1024x1024" : "auto";
  }
  const ratio = w / Math.max(1, h);
  if (isGptImageModel(model)) {
    if (ratio > 1.2) return "1536x1024";
    if (ratio < 0.85) return "1024x1536";
    return "1024x1024";
  }
  if (/dall-e/i.test(model)) {
    if (ratio > 1.4) return "1792x1024";
    if (ratio < 0.72) return "1024x1792";
    return "1024x1024";
  }
  const explicit = requested.match(/^(\d+)x(\d+)$/);
  if (explicit) return `${explicit[1]}x${explicit[2]}`;
  return "auto";
}
