import { expandDistinctPrompts, uniquePrompts } from "@/lib/agents/distinct-image-prompts";
import { resolveImageSizeRequest } from "@/lib/agents/image-size";
import {
  collectProjectReferenceImages,
  slimReferencePreviews,
  withAdoptedStyleReference,
} from "@/lib/agents/reference-images";
import {
  buildImageGenerationConfirmation,
  parseImageGenerationConfirmation,
} from "@/lib/agents/image-generation-confirmation";
import { normalizeImagePrompts } from "@/lib/agents/image-prompts";
import type { ToolContext } from "@/lib/agents/tools/types";
import { clampInt, parseRequestedImageCount } from "@/lib/agents/tools/utils";

export interface GenerateImagesApprovalPlan {
  confirmed: boolean;
  preview: {
    title: string;
    prompt: string;
    prompts: string[];
    reason: string;
    count: number;
    sizeMode: "auto" | "fixed";
    width: number;
    height: number;
    role?: string;
  };
  approvedArgs: Record<string, unknown>;
}

export function imageToolApprovalId(
  runId: string | undefined,
  toolName: string,
  toolCallId?: string,
): string {
  const base = `${runId ?? "run"}:${toolName}`;
  return toolCallId ? `${base}:${toolCallId}` : base;
}

export function toolResultNeedsUserConfirmation(data: unknown): boolean {
  return Boolean(
    data &&
      typeof data === "object" &&
      (data as { confirmationRequired?: unknown }).confirmationRequired === true
  );
}

export function prepareGenerateImagesApproval(
  args: Record<string, unknown>,
  ctx: ToolContext,
): GenerateImagesApprovalPlan | null {
  if (!ctx.project) return null;

  const confirmation = parseImageGenerationConfirmation(ctx.userMessage ?? "");
  const userApproved = isUserImageApproval(args, confirmation.confirmed);
  const fromArgs = normalizeImagePrompts({
    prompt: args.prompt,
    prompts: args.prompts ?? confirmation.prompts,
    variants: args.variants,
    count: args.count,
    n: args.n,
  });

  const userCount = confirmation.count ?? parseRequestedImageCount(ctx.userMessage ?? "");
  const seedPrompts = uniquePrompts(
    (confirmation.prompts && confirmation.prompts.length > 0
      ? confirmation.prompts
      : fromArgs.prompts
    ).filter((p) => p && !looksLikeInternalPromptLeak(p)),
  );
  const requestedCount = clampInt(
    seedPrompts.length >= 2
      ? seedPrompts.length
      : (userCount ?? (userApproved ? Number(args.count ?? args.n ?? 1) : 1)),
    1,
    8,
  );
  const confirmedPrompt =
    confirmation.prompt && !looksLikeInternalPromptLeak(confirmation.prompt)
      ? confirmation.prompt
      : undefined;
  const explicitPrompt =
    typeof args.prompt === "string" &&
    args.prompt.trim() &&
    !looksLikeInternalPromptLeak(args.prompt)
      ? args.prompt.trim()
      : confirmedPrompt;

  const prompts = expandDistinctPrompts({
    basePrompt: explicitPrompt || seedPrompts[0] || "",
    requestedCount,
    existing: seedPrompts,
    kind: "generate",
  });

  const userMessage = sanitizeUserMessageForImagePrompt(ctx.userMessage ?? "");
  const preview = buildImageGenerationConfirmation({
    project: ctx.project,
    userMessage,
    explicitPrompt: prompts[0] || explicitPrompt,
    explicitPrompts: prompts.length > 0 ? prompts : undefined,
    count: Math.max(1, prompts.length),
    skillSize: ctx.agentCtx.skill?.manifest.output.defaultPageSize,
  });
  const requested = resolveImageSizeRequest({
    userMessage,
    sizeMode: args.sizeMode,
    width: args.width,
    height: args.height,
  });
  const preferIds = withAdoptedStyleReference(
    [
      ...(Array.isArray(args.referenceIds)
        ? args.referenceIds.filter((id): id is string => typeof id === "string")
        : []),
      ...((ctx.agentCtx.scratch.composerReferenceIds as string[] | undefined) ?? []),
      ...(typeof ctx.agentCtx.scratch.citedAssetId === "string"
        ? [ctx.agentCtx.scratch.citedAssetId]
        : []),
    ],
    ctx.project.designDirection?.styleSourceAssetId
  );
  const references = collectProjectReferenceImages(ctx.project, { preferIds, max: 3 });
  const referencePreviews = slimReferencePreviews(references);

  return {
    confirmed: userApproved,
    preview: {
      ...preview,
      prompts: prompts.length > 0 ? prompts : (preview.prompts ?? []),
      count: Math.max(1, prompts.length),
      sizeMode: requested.mode,
      width: requested.mode === "fixed" ? requested.width : preview.width,
      height: requested.mode === "fixed" ? requested.height : preview.height,
    },
    approvedArgs: {
      ...args,
      confirmed: true,
      count: Math.max(1, prompts.length),
      n: undefined,
      prompt: prompts[0] ?? preview.prompt,
      prompts,
      size: requested.mode === "fixed" ? requested.size : "auto",
      sizeMode: requested.mode,
      width: requested.mode === "fixed" ? requested.width : undefined,
      height: requested.mode === "fixed" ? requested.height : undefined,
      role: preview.role,
      mode: typeof args.mode === "string" ? args.mode : "async",
      referenceIds: references.ids,
      referencePreviews,
    },
  };
}

export function normalizeGenerateImagesApprovalArgs(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Record<string, unknown> {
  return prepareGenerateImagesApproval(args, ctx)?.approvedArgs ?? args;
}

function isUserImageApproval(
  args: Record<string, unknown>,
  confirmationConfirmed: boolean,
): boolean {
  if (confirmationConfirmed) return true;
  return typeof args.approvalId === "string" && args.approvalId.trim().length > 0;
}

function looksLikeInternalPromptLeak(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return [
    "never show a prompt preview",
    "normal assistant text",
    "use generate_images",
    "render an execution approval card",
    "run/cancel/edit controls",
    "visual asset generation rule",
    "tool approval card",
    "[image_generation_confirmed]",
  ].some((marker) => normalized.includes(marker));
}

function sanitizeUserMessageForImagePrompt(message: string): string {
  return message.replace(/\[IMAGE_GENERATION_CONFIRMED\][\s\S]*$/i, "").trim();
}
