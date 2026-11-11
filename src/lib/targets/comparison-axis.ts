export interface ComparisonRound {
  axis: string;
  question: string;
  hold: string;
}

const ROUNDS: Record<string, [ComparisonRound, ComparisonRound]> = {
  "ui-visual": [
    {
      axis: "疏 ↔ 密",
      question: "哪张更快找到要做的事",
      hold: "内容、主体和完成度相同，只改疏密",
    },
    {
      axis: "静 ↔ 利",
      question: "哪张更像愿意每天打开的",
      hold: "沿用胜出的结构，只改静或利",
    },
  ],
  "game-art": [
    {
      axis: "写实 ↔ 概括",
      question: "哪张更能当这个角色的正稿",
      hold: "同一主体和完成度，只改写实或概括",
    },
    {
      axis: "平涂 ↔ 有体积",
      question: "哪张更能当这个角色的正稿",
      hold: "沿用胜出的画法，只改平涂或体积",
    },
  ],
  "promo-kv": [
    {
      axis: "字为主 ↔ 图为主",
      question: "哪张在三秒内读完卖点",
      hold: "同一卖点和完成度，只改字或图谁为主",
    },
    {
      axis: "留白 ↔ 铺满",
      question: "哪张在三秒内读完卖点",
      hold: "沿用胜出的结构，只改留白或铺满",
    },
  ],
  "social-cover": [
    {
      axis: "一个主体 ↔ 一排信息",
      question: "哪张在信息流里停得住，同时标题还读得清",
      hold: "同一内容和完成度，只改一个主体或一排信息",
    },
    {
      axis: "安静 ↔ 抢眼",
      question: "哪张在信息流里停得住，同时标题还读得清",
      hold: "沿用胜出的结构，只改安静或抢眼",
    },
  ],
  "product-shot": [
    {
      axis: "干净棚拍 ↔ 使用场景",
      question: "哪张更能让人相信这就是这个东西",
      hold: "物体不变，只改棚拍或使用场景",
    },
    {
      axis: "硬光 ↔ 柔光",
      question: "哪张更能让人相信这就是这个东西",
      hold: "沿用胜出的场景，只改硬光或柔光",
    },
  ],
  "style-board": [
    {
      axis: "两个轴的四个角",
      question: "只看差别，可以不选",
      hold: "同一主题一次放四个角，不拆成两轮",
    },
    {
      axis: "两个轴的四个角",
      question: "只看差别，可以不选",
      hold: "同一主题一次放四个角，不拆成两轮",
    },
  ],
};

export function comparisonRound(
  targetId: string | undefined,
  step: 1 | 2
): ComparisonRound {
  const rounds = ROUNDS[targetId ?? ""] ?? ROUNDS["ui-visual"];
  if (targetId === "style-board") return rounds[0];
  return rounds[step - 1];
}

/** 只有界面视觉在点「用这个」之后进入编码生产。不绑设计规范。 */
export function adoptedProductionSkill(targetId: string | undefined): string | undefined {
  return targetId === "ui-visual" ? "web-prototype" : undefined;
}

/** 编码交付只属于界面视觉。其它开头停在稿和卡片。 */
export function showsCodeHandoff(targetId: string | undefined): boolean {
  return targetId === "ui-visual";
}

const SWITCHED_HOLD: Record<string, string> = {
  "ui-visual": "内容、主体和完成度相同，只改静或利",
  "game-art": "同一主体和完成度，只改平涂或体积",
  "promo-kv": "同一卖点和完成度，只改留白或铺满",
  "social-cover": "同一内容和完成度，只改安静或抢眼",
  "product-shot": "物体不变，只改硬光或柔光",
};

export interface SeeingState {
  comparisonStep?: 1 | 2;
  comparisonWinnerAssetId?: string;
  comparisonAxis?: 1 | 2;
}

export const STYLE_CORNERS = [
  { label: "疏且静", rule: "留白多，颜色不超过两种" },
  { label: "疏且利", rule: "留白多，对比强，边缘清楚" },
  { label: "密且静", rule: "信息多，颜色少，节奏均匀" },
  { label: "密且利", rule: "信息多，对比强，层次清楚" },
] as const;

export function currentComparisonAxis(state: SeeingState | undefined): 1 | 2 {
  if (state?.comparisonStep === 2 && state.comparisonWinnerAssetId) return 2;
  if (state?.comparisonAxis === 2) return 2;
  return 1;
}

function roundForState(targetId: string | undefined, state: SeeingState | undefined): ComparisonRound {
  const axis = currentComparisonAxis(state);
  const round = comparisonRound(targetId, axis);
  const hasWinner = Boolean(state?.comparisonWinnerAssetId) && axis === 2;
  if (axis === 2 && !hasWinner && targetId !== "style-board") {
    return { ...round, hold: SWITCHED_HOLD[targetId ?? "ui-visual"] ?? round.hold };
  }
  return round;
}

/** 留下这一边，进入第二轮。不绑定 skill，也不写成全画布风格。 */
export function keepComparisonSide<T extends SeeingState>(project: T, assetId: string): T {
  return {
    ...project,
    comparisonStep: 2,
    comparisonAxis: 2,
    comparisonWinnerAssetId: assetId,
  };
}

/** 这一轴的两端都不要。换到另一根轴，不留下胜者，也不绑定 skill。 */
export function rejectComparisonEnds<
  T extends SeeingState & {
    targetId?: string;
    comparisonBoards?: Array<{ question: string }>;
  },
>(project: T): T {
  if (project.targetId === "style-board") return project;
  const nextAxis = currentComparisonAxis(project) === 1 ? 2 : 1;
  const question = comparisonRound(project.targetId, nextAxis).question;
  return {
    ...project,
    comparisonAxis: nextAxis,
    comparisonStep: 1,
    comparisonWinnerAssetId: undefined,
    comparisonBoards: project.comparisonBoards?.map((board) => ({ ...board, question })),
  };
}

/** 风格探索一轮四个角，各是一张独立稿。 */
export function styleCornerPrompts(subject: string): string[] {
  const text = subject.trim();
  return STYLE_CORNERS.map(
    (corner) => `四个角之一：${corner.label}。${corner.rule}。同一主题，不要拼成一张。 ${text}`
  );
}

/** 还没采用风格时，把这一轮的轴写进提示词。 */
export function applySeeingAxisToPrompt(
  prompt: string,
  targetId: string | undefined,
  stepOrState: 1 | 2 | SeeingState = 1
): string {
  const state: SeeingState =
    typeof stepOrState === "number"
      ? {
          comparisonStep: stepOrState,
          comparisonWinnerAssetId: stepOrState === 2 ? "kept" : undefined,
        }
      : stepOrState;
  const round = roundForState(targetId, state);
  if (prompt.includes(round.axis)) return prompt;
  return `只改一个轴：${round.axis}。${round.hold}。 ${prompt}`;
}

/** 成对出图时，两张分别站在这一轴的两端。 */
export function applySeeingPair(
  prompts: string[],
  targetId: string | undefined,
  state: SeeingState = {}
): string[] {
  if (prompts.length !== 2 || targetId === "style-board") {
    return prompts.map((prompt) => applySeeingAxisToPrompt(prompt, targetId, state));
  }
  const round = roundForState(targetId, state);
  const [left, right] = round.axis.split("↔").map((pole) => pole.trim());
  return prompts.map((prompt, index) => {
    const pole = index === 0 ? left : right;
    return `只改一个轴：${round.axis}。这一张是「${pole}」。${round.hold}。 ${prompt}`;
  });
}

export function comparisonRoundInstruction(
  targetId: string | undefined,
  step: 1 | 2 = 1,
  state?: SeeingState
): string {
  const first = comparisonRound(targetId, 1);
  const second = comparisonRound(targetId, 2);
  const current = state ? roundForState(targetId, { ...state, comparisonStep: state.comparisonStep ?? step }) : step === 2 ? second : first;
  return [
    "看见阶段每一轮只改一个轴。",
    `当前轮：${current.axis}。问：${current.question}。${current.hold}。`,
    `第一轮 ${first.axis}。`,
    targetId === "style-board"
      ? "风格探索一轮放四个角，可以不选。"
      : `第二轮 ${second.axis}。`,
    "不要在同一对图里同时改版式、颜色和字体。",
    "两端都不要就换到另一根轴，不要把两张折中。",
    "不要在用户点用这个之前放全画布规格。",
  ].join("");
}
