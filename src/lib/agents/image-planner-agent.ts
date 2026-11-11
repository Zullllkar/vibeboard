/**
 * Image planner agent.
 *
 * Produces concrete image generation tasks for either existing pending canvas
 * image nodes or standalone asset generation.
 */

import { z } from "zod";
import type { CanvasPage } from "@/lib/canvas/schema";
import { readDesignContextFromScratch } from "@/lib/project/design-context";
import { CopyPlanItemSchema } from "@/lib/project/design-spec-schema";
import type { DesignDirection, ProductBrief } from "@/lib/project/schema";
import { stripJsonFence } from "@/lib/providers/llm/openai-compatible";
import { isMockLlmText } from "@/lib/providers/llm/utils";
import { buildSystemPrompt } from "@/lib/skills/prompt-stack";
import { parseTargetId } from "@/lib/targets/resolve";
import {
  buildPromptCandidates,
  compileVisualBrief,
  inferVisualCategory,
  lintImagePrompt,
  PromptAuditSchema,
  type VisualBriefCategory,
  VisualBriefSchema,
} from "./image";
import type { Agent } from "./types";

export const ImagePlanTaskSchema = z.object({
  pageId: z.string(),
  nodeId: z.string(),
  imagePrompt: z.string().default(""),
  /** Structured visual direction. Preferred over imagePrompt; compiled by the planner. */
  visualBrief: VisualBriefSchema.optional(),
  /** Best-of-N prompt candidates, best first. Generated from visualBrief. */
  promptCandidates: z.array(z.string()).optional(),
  /** Deterministic lint result; computed by the planner, not by the LLM. */
  promptAudit: PromptAuditSchema.optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  role: z.enum(["hero", "illustration", "product-shot", "background", "avatar"]).optional(),
  /** UI 屏才有：生图前定好的 headline / CTA / 导航文案，随资产进 handoff */
  copyPlan: z.array(CopyPlanItemSchema).optional(),
  /** 短中文名，如「训练首页」；缺省时由 prompt 推导。 */
  title: z.string().optional(),
});

export const ImagePlanSchema = z.object({
  tasks: z.array(ImagePlanTaskSchema),
});

export type ImagePlan = z.infer<typeof ImagePlanSchema>;
export type ImagePlanTask = z.infer<typeof ImagePlanTaskSchema>;

export const STANDALONE_BOARD_ID = "asset-board";

export const ImagePlannerAgent: Agent<
  {
    brief: ProductBrief;
    pages: CanvasPage[];
    designDirection?: DesignDirection | null;
    standaloneCount?: number;
    standalonePrompt?: string;
    /** 多类型：每条一个不同任务；优先于 standalonePrompt×count 复制 */
    standalonePrompts?: string[];
    standaloneWidth?: number;
    standaloneHeight?: number;
    standaloneRole?: ImagePlanTask["role"];
  },
  ImagePlan
> = {
  name: "image-planner-agent",
  async run(input, ctx) {
    const pending = collectPendingImageNodes(input.pages);

    if (pending.length === 0) {
      const multiPrompts = (input.standalonePrompts ?? []).map((p) => p.trim()).filter(Boolean);
      if (multiPrompts.length > 0 || input.standalonePrompt?.trim()) {
        return planFromConfirmedPrompt({
          prompt: (multiPrompts[0] || input.standalonePrompt || "").trim(),
          prompts: multiPrompts.length > 0 ? multiPrompts : undefined,
          count: input.standaloneCount ?? 1,
          width: input.standaloneWidth,
          height: input.standaloneHeight,
          role: input.standaloneRole,
        });
      }

      const fromLlm = await tryLlmStandalonePlan(
        input.brief,
        input.designDirection,
        input.standaloneCount ?? 1,
        ctx,
      ).catch(() => null);
      if (fromLlm && fromLlm.tasks.length > 0) return fromLlm;
      return planStandaloneAssetsFallback(
        input.brief,
        input.designDirection,
        input.standaloneCount ?? 1,
        typeof ctx.scratch.targetId === "string" ? ctx.scratch.targetId : undefined,
      );
    }

    const fromLlm = await tryLlmPlan(
      input.brief,
      input.pages,
      pending,
      input.designDirection,
      ctx,
    ).catch(() => null);
    if (fromLlm && fromLlm.tasks.length > 0) return fromLlm;

    return heuristicPlan(input.brief, pending);
  },
};

function planFromConfirmedPrompt({
  prompt,
  prompts,
  count,
  width,
  height,
  role,
}: {
  prompt: string;
  prompts?: string[];
  count: number;
  width?: number;
  height?: number;
  role?: ImagePlanTask["role"];
}): ImagePlan {
  const distinct = (prompts ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8);

  // 多条不同提示词 → 每种一张（不再把第一条复制 N 次）
  if (distinct.length > 1) {
    return {
      tasks: distinct.map((imagePrompt, index) => ({
        pageId: STANDALONE_BOARD_ID,
        nodeId: `asset-${index + 1}`,
        imagePrompt,
        width: width ?? 1280,
        height: height ?? 720,
        role: role ?? (index === 0 ? "hero" : "illustration"),
      })),
    };
  }

  const single = distinct[0] || prompt;
  const n = Math.min(6, Math.max(1, count));
  return {
    tasks: Array.from({ length: n }, (_, index) => ({
      pageId: STANDALONE_BOARD_ID,
      nodeId: `asset-${index + 1}`,
      imagePrompt: single,
      width: width ?? 1280,
      height: height ?? 720,
      role: role ?? "hero",
    })),
  };
}

async function tryLlmStandalonePlan(
  brief: ProductBrief,
  designDirection: DesignDirection | null | undefined,
  count: number,
  ctx: import("./types").AgentContext,
): Promise<ImagePlan | null> {
  const n = Math.min(6, Math.max(1, count));
  const targetId = typeof ctx.scratch.targetId === "string" ? ctx.scratch.targetId : undefined;
  const system = buildSystemPrompt({
    skill: ctx.skill,
    designSystem: ctx.designSystem,
    brief,
    designContext: readDesignContextFromScratch(ctx.scratch),
    extra: { designDirection },
    targetId,
    technicalAddendum: [
      "# Task: Image Planner (Standalone)",
      "Plan standalone visual image assets for the canvas.",
      "Return strict JSON with tasks only.",
      `Return exactly ${n} task(s). Do not increase the count.`,
      "Each task needs nodeId, width, height, role, and a short human title (Chinese ≤12 chars, like 训练首页). Never use an id as the title.",
      "Prefer `visualBrief` over `imagePrompt`. visualBrief is the structured visual direction; the planner compiles it into a short, visual-only prompt.",
      "visualBrief schema: { category: 'ui'|'product'|'promo'|'social'|'concept'|'moodboard', subject: string, visualAnchors: { lighting: string, materials: string[], palette: string[], composition: string, camera?: string, mood: string[] }, textPolicy: 'none'|'overlay', referenceIds: string[], aspectRatio: string, mustKeep?: string[], mustAvoid?: string[] }.",
      "Do not put layout, components, coordinates, or UI copy into visualBrief or imagePrompt. Those belong in Layout IR / copyPlan.",
      parseTargetId(targetId) === "ui-visual"
        ? [
            "For app UI requests, produce a UI visual direction, not a poster or promo banner.",
            "Set category='ui' and textPolicy='overlay'. The image model should leave clean space; real UI copy is rendered in code/canvas.",
            "Decide the real UI copy BEFORE the image exists: add `copyPlan` to each UI task — an array of {id, role, text} where role ∈ headline|subhead|cta|nav|label|body|caption|other. 3–10 items: the headline, subhead, primary CTA, nav items and key labels. Use the product's language (match the brief). Keep each text short and final (no placeholders like 'Lorem' or 'Your text here').",
            "Never quote copyPlan text inside visualBrief or imagePrompt.",
          ].join("\n")
        : "Follow the Goal prompt contract. Do not apply the UI poster ban unless targetId is ui-visual.",
      "Product/promo: include lighting, materials, palette, composition and camera; keep the compiled prompt 35–80 words. Concept: 20–55 words. Social: 18–45 words.",
      "If you provide imagePrompt instead of visualBrief, keep it 20–60 words, visual-only, and avoid generic adjectives like modern/clean/professional/8k.",
      typeof ctx.scratch.citedAssetId === "string"
        ? "The user cited a canvas asset. Match that attached image's palette, materials, lighting, typography, and UI chrome in visualAnchors; set referenceIds. Do not reuse Design context or other recent canvas prompts."
        : Array.isArray(ctx.scratch.referenceLabels) &&
            (ctx.scratch.referenceLabels as string[]).length > 0
          ? `User attached reference images: ${(ctx.scratch.referenceLabels as string[]).join(", ")}. Reflect their style/mood/palette in visualAnchors and set referenceIds.`
          : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const out = await ctx.providers.llm.generateText({
    system,
    prompt: `Plan ${n} standalone image asset(s) for ${brief.productName}. Output JSON: {"tasks":[...]}`,
    schema: { type: "object" },
  });

  if (isMockLlmText(out.text)) return null;

  let json: unknown;
  try {
    json = JSON.parse(stripJsonFence(out.text));
  } catch {
    return null;
  }

  const parsed = ImagePlanSchema.safeParse(json);
  if (!parsed.success) return null;

  const category = inferVisualCategory({ targetId });
  const tasks = parsed.data.tasks.slice(0, n).map((task, index) =>
    finalizeImagePlanTask(
      {
        ...task,
        pageId: task.pageId || STANDALONE_BOARD_ID,
        nodeId: task.nodeId || `asset-${index + 1}`,
      },
      category,
    ),
  );
  return { tasks };
}

/**
 * 规划好的文案保留在 copyPlan 里，由代码/画布叠加。
 * 不要把 UI 文案塞进 imagePrompt：图模型画字会乱码、挤构图、拉低审美。
 */
export function withCopyPlanInPrompt(task: ImagePlanTask): ImagePlanTask {
  const plan = (task.copyPlan ?? [])
    .map((c, i) => ({ ...c, id: c.id?.trim() || `copy-${i + 1}`, text: c.text.trim() }))
    .filter((c) => c.text.length > 0);
  if (plan.length === 0) return { ...task, copyPlan: undefined };
  return { ...task, copyPlan: plan };
}

/**
 * Compile a structured VisualBrief into a short visual-only prompt and lint it.
 * Legacy free-string tasks are linted as-is (no rewriting) so existing
 * confirmed prompts keep working.
 */
export function finalizeImagePlanTask(
  task: ImagePlanTask,
  fallbackCategory?: VisualBriefCategory,
): ImagePlanTask {
  const normalized = withCopyPlanInPrompt(task);
  if (normalized.visualBrief) {
    const candidates = buildPromptCandidates(normalized.visualBrief);
    const best = candidates[0];
    const imagePrompt = best?.prompt ?? compileVisualBrief(normalized.visualBrief);
    return {
      ...normalized,
      imagePrompt,
      promptCandidates: candidates.map((candidate) => candidate.prompt),
      promptAudit: best?.audit ?? lintImagePrompt(imagePrompt, normalized.visualBrief.category),
    };
  }
  const category =
    fallbackCategory ?? inferVisualCategory({ role: normalized.role, targetId: undefined });
  const imagePrompt = normalized.imagePrompt.trim() || normalized.title?.trim() || "visual asset";
  return {
    ...normalized,
    imagePrompt,
    promptAudit: lintImagePrompt(imagePrompt, category),
  };
}

function planStandaloneAssetsFallback(
  brief: ProductBrief,
  designDirection: DesignDirection | null | undefined,
  count: number,
  targetId?: string,
): ImagePlan {
  const n = Math.min(6, Math.max(1, count));
  const category = inferVisualCategory({ targetId });
  const mood = designDirection?.moodKeywords?.slice(0, 4).filter(Boolean) ?? [];
  const product = brief.productName || "product";
  const subject = `${product}; ${brief.positioning}`.slice(0, 140);

  return {
    tasks: Array.from({ length: n }, (_, index) => {
      const width = index === 0 ? 1280 : 1024;
      const height = index === 0 ? 720 : 1024;
      const visualBrief = {
        category,
        subject,
        visualAnchors: {
          lighting: "soft directional daylight",
          materials: category === "product" ? ["matte surface"] : ["matte paper"],
          palette: ["muted neutral", "one accent color"],
          composition: "generous negative space, clear focal point",
          mood: mood.length > 0 ? mood : ["calm", "premium"],
        },
        textPolicy: "none" as const,
        referenceIds: designDirection?.styleSourceAssetId
          ? [designDirection.styleSourceAssetId]
          : [],
        aspectRatio: width === height ? "1:1" : "16:9",
        mustKeep: [],
        mustAvoid: ["watermark"],
      };
      return finalizeImagePlanTask(
        {
          pageId: STANDALONE_BOARD_ID,
          nodeId: `asset-${index + 1}`,
          imagePrompt: "",
          visualBrief,
          width,
          height,
          role: index === 0 ? "hero" : "illustration",
        },
        category,
      );
    }),
  };
}

interface PendingNode {
  pageId: string;
  nodeId: string;
  width: number;
  height: number;
  alt?: string;
  existingPrompt?: string;
}

function collectPendingImageNodes(pages: CanvasPage[]): PendingNode[] {
  const out: PendingNode[] = [];
  for (const page of pages) {
    for (const node of page.nodes) {
      if (node.type !== "image") continue;
      const needsGen =
        node.generation?.model === "pending" ||
        !node.src ||
        node.src.startsWith("data:image/svg+xml");
      if (!needsGen && node.generation?.model && node.generation.model !== "pending") {
        continue;
      }
      out.push({
        pageId: page.id,
        nodeId: node.id,
        width: Math.max(64, Math.round(node.width)),
        height: Math.max(64, Math.round(node.height)),
        alt: node.alt,
        existingPrompt: node.generation?.prompt,
      });
    }
  }
  return out;
}

async function tryLlmPlan(
  brief: ProductBrief,
  pages: CanvasPage[],
  pending: PendingNode[],
  designDirection: DesignDirection | null | undefined,
  ctx: import("./types").AgentContext,
): Promise<ImagePlan | null> {
  const targetId = typeof ctx.scratch.targetId === "string" ? ctx.scratch.targetId : undefined;
  const system = buildSystemPrompt({
    skill: ctx.skill,
    designSystem: ctx.designSystem,
    brief,
    designContext: readDesignContextFromScratch(ctx.scratch),
    extra: {
      designDirection,
      pendingNodes: pending,
      pageSummaries: pages.map((page) => ({
        id: page.id,
        name: page.name,
        imageCount: page.nodes.filter((node) => node.type === "image").length,
      })),
    },
    targetId,
    technicalAddendum: [
      "# Task: Image Planner",
      "Write one visual direction for each pending image node.",
      "Prefer `visualBrief` over `imagePrompt`. visualBrief is structured: { category, subject, visualAnchors: { lighting, materials, palette, composition, camera?, mood }, textPolicy, referenceIds, aspectRatio, mustKeep?, mustAvoid? }.",
      "Do not put layout, components, coordinates, or UI copy into visualBrief or imagePrompt. Those belong in Layout IR / copyPlan.",
      "For UI nodes: category='ui', textPolicy='overlay', and add copyPlan (3-10 items: headline, subhead, CTA, nav, labels). Never ask the image model to render the copy.",
      "If you provide imagePrompt instead of visualBrief, keep it 20-60 words, visual-only, and avoid generic adjectives like modern/clean/professional/8k.",
      "Each task also needs a short human title (Chinese ≤12 chars, like 训练首页). Never use an id as the title.",
      'Return strict JSON: {"tasks":[...]}',
      "Only include real pending pageId/nodeId pairs from pendingNodes.",
    ].join("\n\n"),
  });

  const out = await ctx.providers.llm.generateText({
    system,
    prompt: `Plan image tasks for ${pending.length} pending image node(s). Output JSON.`,
    schema: { type: "object" },
  });

  if (isMockLlmText(out.text)) return null;

  let json: unknown;
  try {
    json = JSON.parse(stripJsonFence(out.text));
  } catch {
    return null;
  }
  const parsed = ImagePlanSchema.safeParse(json);
  if (!parsed.success) return null;

  const valid = new Set(pending.map((item) => `${item.pageId}:${item.nodeId}`));
  const category = inferVisualCategory({ targetId });
  const tasks = parsed.data.tasks
    .filter((task) => valid.has(`${task.pageId}:${task.nodeId}`))
    .map((task) => finalizeImagePlanTask(task, category));
  return { tasks };
}

function heuristicPlan(brief: ProductBrief, pending: PendingNode[]): ImagePlan {
  const style = brief.visualStyle;
  const productContext = `${brief.productName}; ${brief.positioning}`.slice(0, 240);
  return {
    tasks: pending.map((node, index) => ({
      pageId: node.pageId,
      nodeId: node.nodeId,
      width: node.width,
      height: node.height,
      imagePrompt: [
        style,
        productContext,
        node.existingPrompt ?? node.alt ?? `high quality UI illustration, scene ${index + 1}`,
        "no text overlay",
        "no watermark",
      ]
        .filter(Boolean)
        .join(", "),
      role: index === 0 ? "hero" : "illustration",
    })),
  };
}
