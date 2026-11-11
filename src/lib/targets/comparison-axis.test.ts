import { describe, expect, it } from "vitest";
import { getTargetRecipe } from "./catalog";
import {
  adoptedProductionSkill,
  applySeeingAxisToPrompt,
  comparisonRound,
  comparisonRoundInstruction,
  keepComparisonSide,
  rejectComparisonEnds,
  showsCodeHandoff,
  styleCornerPrompts,
} from "./comparison-axis";

describe("comparisonRound", () => {
  it("asks one structural question before any tone question", () => {
    expect(comparisonRound("ui-visual", 1).question).toBe("哪张更快找到要做的事");
    expect(comparisonRound("ui-visual", 2).axis).toBe("静 ↔ 利");
    expect(comparisonRound("style-board", 2).question).toBe("只看差别，可以不选");
  });

  it("tells the agent to change only one axis in a pair", () => {
    const text = comparisonRoundInstruction("promo-kv");
    expect(text).toContain("字为主 ↔ 图为主");
    expect(text).toContain("只改一个轴");
  });

  it("binds a skill only for 界面视觉 and keeps exploration from locking a target", () => {
    expect(adoptedProductionSkill("ui-visual")).toBe("web-prototype");
    expect(adoptedProductionSkill("game-art")).toBeUndefined();
    expect(getTargetRecipe("style-board").goalSentence).toContain("可以不选");
    expect(getTargetRecipe("style-board").goalSentence).not.toContain("正式目标");
  });

  it("adds the current axis to a prompt before a style is adopted", () => {
    const next = applySeeingAxisToPrompt("招聘雷达首页", "ui-visual");
    expect(next).toContain("疏 ↔ 密");
    expect(next).toContain("招聘雷达首页");
  });

  it("moves to the second axis without binding a skill or a design system", () => {
    const next = keepComparisonSide(
      {
        id: "p",
        slug: "p",
        title: "p",
        rawIdea: "idea",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        pages: [],
        targetId: "ui-visual",
      },
      "img-a"
    );
    expect(next.comparisonStep).toBe(2);
    expect(next.comparisonWinnerAssetId).toBe("img-a");
    expect(next.skillId).toBeUndefined();
    expect(applySeeingAxisToPrompt("招聘雷达首页", "ui-visual", 2)).toContain("静 ↔ 利");
  });

  it("switches axis when both ends are rejected and does not keep a winner", () => {
    const base = {
      id: "p",
      slug: "p",
      title: "p",
      rawIdea: "idea",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pages: [],
      targetId: "ui-visual" as const,
      comparisonStep: 2 as const,
      comparisonWinnerAssetId: "img-a",
      skillId: undefined,
    };
    const next = rejectComparisonEnds(base);
    expect(next.comparisonWinnerAssetId).toBeUndefined();
    expect(next.comparisonStep).not.toBe(2);
    expect(next.skillId).toBeUndefined();
    const prompt = applySeeingAxisToPrompt("招聘雷达首页", "ui-visual", {
      comparisonAxis: next.comparisonAxis,
      comparisonStep: next.comparisonStep,
      comparisonWinnerAssetId: next.comparisonWinnerAssetId,
    });
    expect(prompt).toContain("疏 ↔ 密");
    expect(prompt).not.toContain("沿用胜出");

    const fresh = rejectComparisonEnds({ ...base, comparisonStep: 1, comparisonWinnerAssetId: undefined });
    expect(fresh.comparisonAxis).toBe(2);
    expect(fresh.comparisonWinnerAssetId).toBeUndefined();
    expect(fresh.skillId).toBeUndefined();
    const switched = applySeeingAxisToPrompt("招聘雷达首页", "ui-visual", {
      comparisonAxis: fresh.comparisonAxis,
      comparisonStep: fresh.comparisonStep,
      comparisonWinnerAssetId: fresh.comparisonWinnerAssetId,
    });
    expect(switched).toContain("静 ↔ 利");
    expect(switched).not.toContain("沿用胜出");
  });

  it("writes four corners for style exploration and does not collapse them", () => {
    const prompts = styleCornerPrompts("茶饮海报");
    expect(prompts).toHaveLength(4);
    expect(new Set(prompts).size).toBe(4);
    for (const prompt of prompts) {
      expect(prompt).toContain("茶饮海报");
      expect(prompt).toContain("不要拼成一张");
    }
    expect(prompts.join("\n")).toContain("疏且静");
    expect(prompts.join("\n")).toContain("密且利");
  });

  it("offers the coding handoff only for 界面视觉", () => {
    expect(showsCodeHandoff("ui-visual")).toBe(true);
    expect(showsCodeHandoff("game-art")).toBe(false);
    expect(showsCodeHandoff("promo-kv")).toBe(false);
    expect(showsCodeHandoff("social-cover")).toBe(false);
    expect(showsCodeHandoff("product-shot")).toBe(false);
    expect(showsCodeHandoff("style-board")).toBe(false);
  });
});
