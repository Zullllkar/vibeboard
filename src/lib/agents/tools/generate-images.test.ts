import { describe, expect, it, beforeEach } from "vitest";
import { registerAllTools } from "@/lib/agents/tools";
import { toolRegistry } from "@/lib/agents/tools/registry";
import type { ToolContext } from "@/lib/agents/tools/types";
import type { AgentContext } from "@/lib/agents/types";
import type { ProjectFile } from "@/lib/project/schema";

function makeAgentCtx(projectId = "omni-1"): AgentContext {
  return {
    projectId,
    scratch: {},
    providers: {
      llm: { kind: "mock" } as never,
      image: {
        kind: "mock",
        generateImage: async () => ({
          imageUrl: "data:image/png;base64,mock",
          model: "mock",
        }),
      } as never,
      visionCritic: false,
    },
  };
}

function canvasProjectWithoutBrief(id = "omni-1"): ProjectFile {
  return {
    id,
    slug: id,
    title: "omni1.0.3",
    rawIdea: "生成不同设计的版本出来",
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    pages: [],
    assets: [],
  };
}

describe("generate_images without brief", () => {
  beforeEach(() => {
    registerAllTools();
  });

  it("fans a vibe-mode batch into three different looks", async () => {
    const ctx: ToolContext = {
      project: {
        ...canvasProjectWithoutBrief("vibe-fan"),
        studioMode: "vibe",
        rawIdea: "游戏点子收集网站",
        targetId: "ui-visual",
      },
      userMessage: "生成首页",
      agentCtx: makeAgentCtx("vibe-fan"),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      } as ToolContext["providerConfig"],
    };
    const result = await toolRegistry.execute(
      "generate_images",
      {
        prompts: ["浅色极简游戏点子墙", "浅色极简游戏点子墙"],
        count: 2,
        mode: "async",
      },
      ctx
    );
    const data = result.data as { prompts?: string[] };
    expect(data.prompts).toHaveLength(3);
    expect(new Set(data.prompts).size).toBe(3);
    expect(data.prompts?.join("\n")).not.toContain("浅色极简游戏点子墙");
  });

  it("does not follow a spec card the user has not adopted", async () => {
    const ctx: ToolContext = {
      project: {
        ...canvasProjectWithoutBrief("spec-idle"),
        canvasNotes: [
          {
            id: "spec-1",
            kind: "spec",
            title: "规格",
            body: "冷灰底，墨黑字，无彩色",
            createdAt: "2026-10-23T00:00:00.000Z",
          },
        ],
      },
      userMessage: "生成首页",
      agentCtx: makeAgentCtx("spec-idle"),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      } as ToolContext["providerConfig"],
    };
    const result = await toolRegistry.execute(
      "generate_images",
      {
        prompts: ["招聘雷达首页", "招聘雷达首页的另一种疏密"],
        count: 2,
        mode: "async",
      },
      ctx
    );
    const data = result.data as { prompts?: string[] };
    expect(data.prompts).toEqual(["招聘雷达首页", "招聘雷达首页的另一种疏密"]);
  });

  it("leaves a pair of prompts as written instead of forcing a comparison axis", async () => {
    const ctx: ToolContext = {
      project: {
        ...canvasProjectWithoutBrief("round-2"),
        comparisonStep: 2,
        comparisonWinnerAssetId: "img-a",
      },
      userMessage: "再出两张",
      agentCtx: makeAgentCtx("round-2"),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      } as ToolContext["providerConfig"],
    };
    const result = await toolRegistry.execute(
      "generate_images",
      {
        prompts: ["招聘雷达首页", "招聘雷达首页的另一种语气"],
        count: 2,
        mode: "async",
      },
      ctx
    );
    const data = result.data as { prompts?: string[] };
    expect(data.prompts).toEqual(["招聘雷达首页", "招聘雷达首页的另一种语气"]);
  });

  it("does not expand style exploration into four forced corners", async () => {
    const ctx: ToolContext = {
      project: {
        ...canvasProjectWithoutBrief("style-four"),
        targetId: "style-board",
      },
      userMessage: "并排看茶饮海报",
      agentCtx: makeAgentCtx("style-four"),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      } as ToolContext["providerConfig"],
    };
    const result = await toolRegistry.execute(
      "generate_images",
      {
        prompts: ["茶饮海报", "茶饮海报的另一种"],
        count: 2,
        mode: "async",
      },
      ctx
    );
    const data = result.data as { prompts?: string[] };
    expect(data.prompts).toEqual(["茶饮海报", "茶饮海报的另一种"]);
  });

  it("follows the canvas style spec when preparing an image", async () => {
    const ctx: ToolContext = {
      project: {
        ...canvasProjectWithoutBrief("spec-style"),
        canvasNotes: [
          {
            id: "spec-1",
            kind: "spec",
            title: "规格",
            body: "冷灰底，墨黑字，无彩色",
            adopted: true,
            createdAt: "2026-10-23T00:00:00.000Z",
          },
        ],
      },
      userMessage: "生成首页",
      agentCtx: makeAgentCtx("spec-style"),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      },
      runId: "run-spec",
    };

    const result = await toolRegistry.execute(
      "generate_images",
      { prompt: "招聘雷达首页", count: 1, mode: "async" },
      ctx
    );
    const data = result.data as { prompts?: string[] };
    expect(data.prompts?.[0]).toContain("冷灰底，墨黑字，无彩色");
  });

  it("does not block a canvas project that never ran generate_brief", async () => {
    const ctx: ToolContext = {
      project: canvasProjectWithoutBrief(),
      userMessage: "生成深色版",
      agentCtx: makeAgentCtx(),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      },
      runId: "run-1",
    };

    const result = await toolRegistry.execute(
      "generate_images",
      {
        prompt: "Dark theme OmniTab home matching the reference",
        count: 1,
        confirmed: true,
        approvalId: "run-1:generate_images",
        mode: "async",
      },
      ctx
    );

    expect(result.summary).not.toMatch(/Missing brief/i);
    expect(result.data).toMatchObject({ jobId: expect.any(String) });
  });

  it("stages generating placeholders and scratch before the job can reload disk", async () => {
    const agentCtx = makeAgentCtx("omni-placeholder");
    const ctx: ToolContext = {
      project: canvasProjectWithoutBrief("omni-placeholder"),
      userMessage: "生成封面",
      agentCtx,
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      },
      runId: "run-placeholder",
    };

    const result = await toolRegistry.execute(
      "generate_images",
      {
        prompt: "Xiaohongshu cover for GPT-6",
        count: 1,
        confirmed: true,
        approvalId: "run-placeholder:generate_images",
        mode: "async",
      },
      ctx
    );

    const pending = result.updatedProject?.assets ?? [];
    expect(pending.some((asset) => asset.status === "generating")).toBe(true);
    expect(agentCtx.scratch.__updatedProject).toBe(result.updatedProject);
    expect(result.summary).toMatch(/占位图|正在生成|已开始生成/);
  });

  it("keeps placeholders visible even if the model asked for sync mode", async () => {
    const ctx: ToolContext = {
      project: canvasProjectWithoutBrief("omni-sync-placeholder"),
      userMessage: "生成封面",
      agentCtx: makeAgentCtx("omni-sync-placeholder"),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      },
      runId: "run-sync-placeholder",
    };

    const result = await toolRegistry.execute(
      "generate_images",
      {
        prompt: "Xiaohongshu cover for GPT-6",
        count: 1,
        confirmed: true,
        approvalId: "run-sync-placeholder:generate_images",
        mode: "sync",
      },
      ctx
    );

    expect(result.data).toMatchObject({ jobId: expect.any(String) });
    expect(result.updatedProject?.assets?.some((a) => a.status === "generating")).toBe(
      true
    );
  });

  it("confirms one image when one empty spawn is waiting and the user did not ask for a count", async () => {
    const parent = {
      id: "parent",
      prompt: "hero",
      src: "/api/assets/p1/assets/hero.png",
      width: 1024,
      height: 1024,
      model: "tt-image-2.5",
      createdAt: "2026-10-14T00:00:00.000Z",
      status: "candidate" as const,
    };
    const slot = {
      id: "slot",
      prompt: "",
      src: "",
      width: 1024,
      height: 1024,
      model: "pending",
      createdAt: "2026-10-14T00:00:01.000Z",
      status: "candidate" as const,
      parentAssetId: "parent",
    };
    const ctx: ToolContext = {
      project: { ...canvasProjectWithoutBrief("spawn-one"), assets: [parent, slot] },
      userMessage: "生成功能宣传页面",
      agentCtx: makeAgentCtx("spawn-one"),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      },
      runId: "run-spawn-one",
    };

    const result = await toolRegistry.execute(
      "generate_images",
      {
        prompts: ["feature one", "feature two", "feature three"],
        mode: "async",
      },
      ctx
    );

    const data = result.data as { prompts?: string[]; count?: number };
    expect(data.prompts).toEqual(["feature one"]);
    expect(data.count).toBe(1);
  });

  it("fills the empty spawn when the confirmed card still lists three prompts", async () => {
    const parent = {
      id: "parent",
      prompt: "hero",
      src: "/api/assets/p1/assets/hero.png",
      width: 1024,
      height: 1024,
      model: "tt-image-2.5",
      createdAt: "2026-10-14T00:00:00.000Z",
      status: "candidate" as const,
    };
    const slot = {
      id: "slot",
      prompt: "",
      src: "",
      width: 1024,
      height: 1024,
      model: "pending",
      createdAt: "2026-10-14T00:00:01.000Z",
      status: "candidate" as const,
      parentAssetId: "parent",
    };
    const ctx: ToolContext = {
      project: { ...canvasProjectWithoutBrief("spawn-confirm"), assets: [parent, slot] },
      userMessage: "生成功能宣传页面",
      agentCtx: makeAgentCtx("spawn-confirm"),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      },
      runId: "run-spawn-confirm",
    };

    const result = await toolRegistry.execute(
      "generate_images",
      {
        prompts: ["feature one", "feature two", "feature three"],
        confirmed: true,
        approvalId: "run-spawn-confirm:generate_images",
        mode: "async",
      },
      ctx
    );

    const assets = result.updatedProject?.assets ?? [];
    const generating = assets.filter((asset) => asset.status === "generating");
    expect(generating.map((asset) => asset.id)).toEqual(["slot"]);
    expect(assets).toHaveLength(2);
  });

  it("does not queue a second job when the same approval runs again at 1080x1440", async () => {
    const ctx: ToolContext = {
      project: canvasProjectWithoutBrief("omni-dedupe"),
      userMessage: "生成封面",
      agentCtx: makeAgentCtx("omni-dedupe"),
      providerConfig: {
        llm: { kind: "mock" },
        image: { kind: "mock" },
      },
      runId: "run-dedupe",
    };
    const args = {
      prompt: "Xiaohongshu GPT-6 cover",
      count: 1,
      confirmed: true,
      approvalId: "run-dedupe:generate_images",
      mode: "async" as const,
      width: 1080,
      height: 1440,
    };

    const first = await toolRegistry.execute("generate_images", args, ctx);
    const second = await toolRegistry.execute("generate_images", args, ctx);
    const firstJobId = (first.data as { jobId?: string }).jobId;
    const secondData = second.data as { jobId?: string; deduped?: boolean };

    expect(firstJobId).toEqual(expect.any(String));
    expect(secondData.jobId).toBe(firstJobId);
    expect(secondData.deduped).toBe(true);
  });
});
