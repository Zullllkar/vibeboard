/**
 * Conservative, deterministic prompt cleanup.
 *
 * This is not a rewriter: it removes known failure modes (generic adjectives,
 * quoted UI copy, layout clauses), fills missing visual anchors with safe
 * category defaults, and enforces the category word budget.
 *
 * It must be idempotent: running it twice should not keep changing the prompt.
 */

import { countWords } from "./prompt-compiler";
import { lintImagePrompt } from "./prompt-linter";
import { getPromptPolicy } from "./prompt-policy";
import type { VisualBriefCategory } from "./visual-brief";

export interface PromptFixResult {
  prompt: string;
  changes: string[];
}

type Anchor = "lighting" | "materials" | "palette" | "composition" | "camera" | "mood";

const GENERIC =
  /\b(modern|clean|professional|high[- ]quality|stunning|beautiful|amazing|perfect|cutting[- ]edge|8k|ultra[- ]detailed|award[- ]winning|masterpiece|trending)\b[, ]*/gi;

const ABSTRACT_NEGATIVE =
  /\b(no|avoid|without)\s+(clutter|mess|bad design|ugly|generic|boring)\b[, ]*/gi;

const DEFAULTS: Record<VisualBriefCategory, Partial<Record<Anchor, string>>> = {
  ui: {
    lighting: "soft directional lighting",
    materials: "matte paper, frosted glass",
    palette: "muted neutral palette",
    composition: "generous negative space",
  },
  product: {
    lighting: "soft studio lighting",
    materials: "matte surface, soft reflections",
    palette: "muted neutral palette",
    composition: "centered with generous negative space",
    camera: "35mm, shallow depth of field",
    mood: "premium, tactile",
  },
  promo: {
    lighting: "cinematic directional light",
    materials: "paper texture",
    palette: "muted palette with one accent",
    composition: "bold focal hierarchy, title space",
    mood: "premium, playful",
  },
  social: {
    lighting: "soft window light",
    materials: "paper texture",
    palette: "warm neutral palette",
    composition: "generous title space",
    mood: "cozy, aspirational",
  },
  concept: {
    lighting: "cinematic rim light",
    materials: "painterly texture",
    palette: "muted cinematic palette",
    composition: "strong silhouette, layered depth",
    camera: "35mm",
    mood: "epic, atmospheric",
  },
  moodboard: {
    lighting: "soft diffused light",
    materials: "rice paper, ceramic",
    palette: "muted jade and ink palette",
    composition: "editorial grid, breathing room",
    mood: "quiet, refined",
  },
};

export function autoFixImagePrompt(prompt: string, category: VisualBriefCategory): PromptFixResult {
  const original = prompt.replace(/\s+/g, " ").trim();
  if (!original) return { prompt: original, changes: [] };

  const policy = getPromptPolicy(category);
  const changes: string[] = [];
  let text = original;

  const generic = removeGeneric(text);
  if (generic.count > 0) {
    text = generic.text;
    changes.push(`移除 ${generic.count} 个 generic 词`);
    if (!text.trim()) {
      return { prompt: original, changes: ["主体全是 generic 词，需要手动改写"] };
    }
  }

  const unquoted = text.replace(/["“][^"”]{2,}["”]/g, " ");
  if (unquoted !== text) {
    text = unquoted;
    changes.push("移除引号里的 UI 文案");
  }

  const negatives = removeAbstractNegatives(text);
  if (negatives.count > 0) {
    text = negatives.text;
    changes.push(`移除 ${negatives.count} 个抽象否定`);
  }

  const stripped = stripBannedClauses(text, category);
  if (stripped.count > 0) {
    text = stripped.text;
    changes.push(`移除 ${stripped.count} 段布局/文案指令`);
  }

  const anchored = addMissingAnchors(text, category);
  if (anchored !== text) {
    text = anchored;
    changes.push("补充缺失的视觉锚点");
  }

  const policyPhrase =
    category === "ui" ? "empty space for text overlay" : "no added text, no watermark";
  if (!text.toLowerCase().includes(policyPhrase.toLowerCase())) {
    text = `${text}, ${policyPhrase}`;
    changes.push("添加文字策略");
  }

  const trimmed = trimToBudget(text, category);
  if (trimmed !== text) {
    text = trimmed;
    changes.push(`截断到 ${policy.maxWords} 词以内`);
  }

  text = text
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();

  if (!text) {
    return { prompt: original, changes: ["无法安全清理，请手动修改"] };
  }
  return { prompt: text, changes };
}

function removeGeneric(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(GENERIC, () => {
    count += 1;
    return " ";
  });
  return { text: out.replace(/\s+/g, " ").trim(), count };
}

function removeAbstractNegatives(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(ABSTRACT_NEGATIVE, () => {
    count += 1;
    return " ";
  });
  return { text: out.replace(/\s+/g, " ").trim(), count };
}

function stripBannedClauses(
  text: string,
  category: VisualBriefCategory,
): { text: string; count: number } {
  const policy = getPromptPolicy(category);
  const parts = text
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const kept: string[] = [];
  let count = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const banned = policy.bannedPatterns.some((pattern) => pattern.test(part));
    if (!banned) {
      kept.push(part);
      continue;
    }
    if (index === 0) {
      const subject = part.replace(/\s+with\s+.*$/i, "").trim();
      if (subject && !policy.bannedPatterns.some((pattern) => pattern.test(subject))) {
        kept.push(subject);
        count += 1;
      } else {
        // Never delete the subject entirely; the linter will still warn.
        kept.push(part);
      }
    } else {
      count += 1;
    }
  }

  return { text: kept.join(", "), count };
}

function addMissingAnchors(text: string, category: VisualBriefCategory): string {
  const audit = lintImagePrompt(text, category);
  const defaults = DEFAULTS[category];
  let out = text;

  for (const issue of audit.issues) {
    if (issue.code !== "missing-anchor") continue;
    const match = issue.message.match(/Missing (\w+) anchor/i);
    const anchor = match?.[1] as Anchor | undefined;
    if (!anchor) continue;
    const phrase = defaults[anchor];
    if (!phrase) continue;
    if (out.toLowerCase().includes(phrase.toLowerCase())) continue;
    out = `${out}, ${phrase}`;
  }

  return out;
}

function trimToBudget(text: string, category: VisualBriefCategory): string {
  const policy = getPromptPolicy(category);
  if (countWords(text) <= policy.maxWords) return text;

  const parts = text.split(/,\s*/).filter(Boolean);
  while (parts.length > 2 && countWords(parts.join(", ")) > policy.maxWords) {
    // Remove the second-to-last part so the final text policy survives.
    parts.splice(parts.length - 2, 1);
  }
  return parts.join(", ");
}
