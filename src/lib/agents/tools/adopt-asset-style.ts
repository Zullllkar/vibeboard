/**
 * 按用户点名的那张图，锁定项目视觉方向。
 * 挂在这张图上的规格卡一起生效。其它图留在画布上，不改它们。
 */

import {
  buildAdoptedDesignDirection,
  parseAdoptAssetId,
} from "@/lib/agents/adopt-asset-style";
import { activeStyleSpec, adoptStyleNotes } from "@/lib/canvas/canvas-notes";
import { adoptedProductionSkill } from "@/lib/targets/comparison-axis";
import { resolveTargetId } from "@/lib/targets/resolve";
import { buildDesignContext } from "@/lib/project/design-context";
import type { AgentTool, ToolContext, ToolResult } from "./types";
import { isUsableReferenceImage, ProjectFileSchema } from "./utils";
import type { DirectionConfirmationData } from "./confirm-direction";

export const adoptAssetStyleTool: AgentTool = {
  name: "adopt_asset_style",
  description:
    "用户点「用这个」或发送 [采用素材风格] 时调用。把这张图和它旁边的规格卡收成当前风格。不改画布上的其它图。",
  inputPhase: ["BRIEF", "DIRECTION", "GENERATION", "REVIEW"],
  outputPhase: "REVIEW",
  riskLevel: "moderate",
  timeoutMs: 120_000,
  parameters: {
    type: "object",
    properties: {
      assetId: { type: "string", description: "作为风格基准的素材 id" },
    },
  },

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    if (!ctx.project) throw new Error("缺少项目，无法采用素材风格");
    const assetId = parseAdoptAssetId(
      ctx.userMessage,
      typeof args.assetId === "string" ? args.assetId : undefined
    );
    if (!assetId) {
      throw new Error("请先选中一张素材，再采用它的视觉风格");
    }

    const asset = (ctx.project.assets ?? []).find((item) => item.id === assetId);
    if (!asset) throw new Error("找不到要采用风格的素材");
    if (!isUsableReferenceImage(asset.src)) {
      throw new Error("这张素材还没有可用画面，无法作为风格基准");
    }

    const now = new Date().toISOString();
    const canvasNotes = adoptStyleNotes(ctx.project.canvasNotes, assetId);
    const styleSpec = activeStyleSpec(canvasNotes);
    const designDirection = buildAdoptedDesignDirection({
      existing: ctx.project.designDirection,
      assetPrompt: asset.prompt,
      visualStyle: styleSpec ?? ctx.project.brief?.visualStyle,
      assetId,
    });
    const imageStyle = styleSpec ?? designDirection.summary;
    const designContext = ctx.project.brief
      ? {
          ...buildDesignContext({
            brief: ctx.project.brief,
            designDirection,
            designSystemId: ctx.project.designSystemId,
            now,
          }),
          source: "user" as const,
          imageStyle,
        }
      : ctx.project.designContext
        ? {
            ...ctx.project.designContext,
            source: "user" as const,
            imageStyle,
            moodKeywords: designDirection.moodKeywords,
            updatedAt: now,
          }
        : undefined;

    const skillId = adoptedProductionSkill(resolveTargetId(ctx.project));
    const updated = ProjectFileSchema.parse({
      ...ctx.project,
      canvasNotes,
      designDirection,
      designContext,
      skillId: skillId ?? ctx.project.skillId,
      designSystemId: skillId ? undefined : ctx.project.designSystemId,
      updatedAt: now,
    });

    const confirmation: DirectionConfirmationData = {
      title: "已按选中画面锁定视觉方向",
      summary: designDirection.summary,
      tone: designDirection.moodKeywords.join("、"),
      imageStyle: designContext?.imageStyle ?? designDirection.summary,
    };
    ctx.agentCtx.scratch.designDirectionSummary = designDirection.summary;
    ctx.agentCtx.scratch.designContext = designContext;
    ctx.agentCtx.scratch.__directionConfirmation = confirmation;
    ctx.onProjectUpdate?.(updated);

    return {
      summary: styleSpec
        ? "已采用这张图和它的规格卡。其它图保持原样。"
        : "已采用这张图作为参考。其它图保持原样。",
      data: {
        confirmationRequired: true,
        assetId,
        restyleCount: 0,
      },
      updatedProject: updated,
      fileWrites: ["design/direction.json"],
    };
  },

  async fallback(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    return this.execute(args, ctx);
  },
};
