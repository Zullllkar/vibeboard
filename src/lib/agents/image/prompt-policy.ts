/**
 * Category-aware prompt policy.
 *
 * A UI prompt and a product-shot prompt should not have the same budget.
 * These are deliberately simple, inspectable rules — not model routing.
 */

import type { VisualBriefCategory } from "./visual-brief";

export type PromptPolicy = {
  category: VisualBriefCategory;
  label: string;
  minWords: number;
  maxWords: number;
  /** Minimum share of tokens that should describe visual qualities. */
  minVisualTokenRatio: number;
  /** Human-readable anchors that should appear. */
  requiredAnchors: Array<"lighting" | "materials" | "palette" | "composition" | "camera" | "mood">;
  /** Copy/layout instructions that belong in Layout IR, not in the image prompt. */
  bannedPatterns: RegExp[];
};

const LAYOUT_OR_COPY =
  /\b(px|rem|vh|vw|grid|navbar|nav bar|sidebar|header|footer|button|input|checkbox|radio|dropdown|layout|column|row|responsive|breakpoint|component|cta|headline|subheadline|placeholder|lorem|password|email address|forgot password|remember me)\b/i;

const UI_LAYOUT = /\b(card|cards|grid|column|row|sidebar|header|footer|navbar|nav bar)\b/i;

export const PROMPT_POLICIES: Record<VisualBriefCategory, PromptPolicy> = {
  ui: {
    category: "ui",
    label: "UI screen",
    minWords: 20,
    maxWords: 45,
    minVisualTokenRatio: 0.7,
    requiredAnchors: ["lighting", "materials", "palette", "composition"],
    bannedPatterns: [LAYOUT_OR_COPY, UI_LAYOUT],
  },
  product: {
    category: "product",
    label: "Product shot",
    minWords: 35,
    maxWords: 80,
    minVisualTokenRatio: 0.65,
    requiredAnchors: ["lighting", "materials", "palette", "composition", "camera"],
    bannedPatterns: [LAYOUT_OR_COPY],
  },
  promo: {
    category: "promo",
    label: "Campaign key visual",
    minWords: 25,
    maxWords: 65,
    minVisualTokenRatio: 0.65,
    requiredAnchors: ["lighting", "materials", "palette", "composition"],
    bannedPatterns: [LAYOUT_OR_COPY],
  },
  social: {
    category: "social",
    label: "Social cover",
    minWords: 18,
    maxWords: 45,
    minVisualTokenRatio: 0.65,
    requiredAnchors: ["lighting", "palette", "composition"],
    bannedPatterns: [LAYOUT_OR_COPY],
  },
  concept: {
    category: "concept",
    label: "Concept art",
    minWords: 20,
    maxWords: 55,
    minVisualTokenRatio: 0.7,
    requiredAnchors: ["lighting", "palette", "composition", "mood"],
    bannedPatterns: [LAYOUT_OR_COPY],
  },
  moodboard: {
    category: "moodboard",
    label: "Brand moodboard",
    minWords: 18,
    maxWords: 45,
    minVisualTokenRatio: 0.65,
    requiredAnchors: ["lighting", "materials", "palette", "composition"],
    bannedPatterns: [LAYOUT_OR_COPY],
  },
};

export function getPromptPolicy(category: VisualBriefCategory): PromptPolicy {
  return PROMPT_POLICIES[category];
}
