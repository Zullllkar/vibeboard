import { nanoid } from "nanoid";
import { activeStyleSpec } from "@/lib/canvas/canvas-notes";
import type { ProjectFile } from "@/lib/project/schema";
import { parseTargetId } from "@/lib/targets/resolve";
import type { ToolCall } from "./chat-schema";

const STYLE_IDS = new Set([
  "tone",
  "mood",
  "palette",
  "render",
  "style",
  "words",
  "visualStyle",
  "rendering",
  "look",
  "renderLanguage",
]);

const LOOKS: Record<string, [string, string, string]> = {
  "ui-visual": [
    "浅底、大留白、字少、只有一块主操作",
    "浅底、信息很满、分区多、一次能看全",
    "深底、对比强、重点一块很亮",
  ],
  "game-art": [
    "写实、细节多、光从一侧来",
    "概括、色块少、轮廓清楚",
    "平涂、线条干净、几乎没有体积",
  ],
  "promo-kv": [
    "句子很大、画面很少",
    "图占满、字很小",
    "留白多、只有一个卖点",
  ],
  "social-cover": [
    "一个主体、标题短",
    "一排信息、标题仍读得清",
    "深色、主体靠边、标题很亮",
  ],
  "product-shot": [
    "干净棚拍、物体居中、背景纯",
    "放在使用场景里、物体仍是主角",
    "硬光、影子清楚",
  ],
  "style-board": [
    "浅、静、留白多",
    "密、信息一次铺开",
    "深、对比强",
  ],
};

export function isVibeMode(project: { studioMode?: string } | null | undefined): boolean {
  return project?.studioMode === "vibe";
}

export function vibeLocked(project: ProjectFile | null | undefined): boolean {
  if (!project) return false;
  if (project.designDirection?.styleSourceAssetId) return true;
  return Boolean(activeStyleSpec(project.canvasNotes));
}

export function isStyleQuestion(question: { id?: string; label?: string }): boolean {
  const id = String(question.id ?? "");
  if (STYLE_IDS.has(id)) return true;
  return /风格|调性|配色|渲染|气质|色板/.test(String(question.label ?? ""));
}

export function questionsForStudioMode<T extends { id?: string; label?: string }>(
  questions: T[],
  mode: "directed" | "vibe"
): T[] {
  if (mode !== "vibe") return questions;
  return questions.filter((question) => !isStyleQuestion(question));
}

export function vibeSubject(
  project:
    | {
        rawIdea?: string;
        title?: string;
        brief?: { summary?: string; productName?: string };
      }
    | null
    | undefined,
  userMessage: string
): string {
  const briefName = project?.brief?.productName || project?.brief?.summary;
  if (/^\[(需求确认回答|视觉方向)/.test(userMessage)) {
    return (briefName || project?.rawIdea || project?.title || "这个主题").slice(0, 180);
  }
  const cleaned = userMessage.replace(/\[[^\]]+\]/g, "").trim();
  if (cleaned.length >= 8 && !/^(生成|再出|出图)/.test(cleaned)) return cleaned.slice(0, 180);
  return (project?.rawIdea || briefName || project?.title || cleaned || "这个主题").slice(0, 180);
}

export function vibeImagePrompts(subject: string, targetId?: string): string[] {
  const topic = subject.trim().slice(0, 180) || "这个主题";
  const looks = LOOKS[parseTargetId(targetId)] ?? LOOKS["ui-visual"];
  return looks.map(
    (look) =>
      `${topic}。这一张只要这种画面：${look}。内容和主体与另外两张相同，配色、疏密和材质必须明显不同。不要套同一套设计系统。`
  );
}

function isSingleImageFollowup(userMessage: string): boolean {
  return /变体|重绘|继续改|改这张|这张图|重新生成|采用素材风格/.test(userMessage);
}

export function applyVibeDecision<
  T extends { thinking: string; calls: ToolCall[]; mode?: "chat" | "tools" },
>(project: ProjectFile | null, userMessage: string, decision: T): T {
  if (!isVibeMode(project) || vibeLocked(project) || decision.mode === "chat") return decision;
  const calls = decision.calls.flatMap((call) => {
    if (call.name === "plan_design_direction" || call.name === "confirm_direction") return [];
    if (call.name !== "ask_discovery") return [call];
    const questions = Array.isArray(call.args?.questions) ? call.args.questions : [];
    const kept = questionsForStudioMode(
      questions as Array<{ id?: string; label?: string }>,
      "vibe"
    );
    return [{ ...call, args: { ...call.args, questions: kept } }];
  });
  const asking = calls.some((call) => call.name === "ask_discovery");
  const followup = isSingleImageFollowup(userMessage);
  const next = calls.map((call) => {
    if (followup || call.name !== "generate_images") return call;
    const existing = call.args?.prompts;
    if (
      Array.isArray(existing) &&
      existing.every((item) => String(item).includes("这一张只要这种画面"))
    ) {
      return call;
    }
    return {
      ...call,
      args: {
        ...call.args,
        prompts: vibeImagePrompts(vibeSubject(project, userMessage), project?.targetId),
        count: 3,
      },
    };
  });
  const hasImages = next.some(
    (call) => call.name === "generate_images" || call.name === "generate_image_variants"
  );
  const droppedDirection = decision.calls.some(
    (call) => call.name === "plan_design_direction" || call.name === "confirm_direction"
  );
  if (!followup && !asking && !hasImages && (droppedDirection || next.some((call) => call.name === "generate_brief"))) {
    next.push({
      id: nanoid(8),
      name: "generate_images",
      args: {
        prompts: vibeImagePrompts(vibeSubject(project, userMessage), project?.targetId),
        count: 3,
      },
    });
  }
  if (next.length === calls.length && next.every((call, index) => call === calls[index]) && next.length === decision.calls.length) {
    return decision;
  }
  return {
    ...decision,
    thinking: droppedDirection
      ? "找感觉：先出三张同一主题、画面明显不同的图，不先锁一种风格。"
      : decision.thinking,
    calls: next,
  };
}
