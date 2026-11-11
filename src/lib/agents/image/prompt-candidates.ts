/**
 * Best-of-N at the prompt level.
 *
 * A single VisualBrief can produce several valid visual directions. We compile
 * a small set of emphasis variants, lint each one, and rank them by visual
 * density / cleanliness. The winner becomes the task prompt; all candidates are
 * kept on the task so a future image-level reranker can generate and compare.
 *
 * This is deliberately cheap: no extra image generation, no model routing.
 */

import { compileVisualBrief } from "./prompt-compiler";
import { lintImagePrompt, type PromptAudit, scorePromptAudit } from "./prompt-linter";
import type { VisualBrief } from "./visual-brief";

export type PromptEmphasis = "balanced" | "lighting" | "composition" | "material" | "mood";

export interface PromptCandidate {
  prompt: string;
  emphasis: PromptEmphasis;
  audit: PromptAudit;
  score: number;
}

const EMPHASES: PromptEmphasis[] = ["balanced", "lighting", "composition", "material", "mood"];

export function buildPromptCandidates(brief: VisualBrief, count = 3): PromptCandidate[] {
  const limit = Math.max(1, Math.min(Math.round(count) || 1, EMPHASES.length));
  const seen = new Set<string>();
  const candidates: PromptCandidate[] = [];

  for (const emphasis of EMPHASES.slice(0, limit)) {
    const prompt = compileVisualBrief(withEmphasis(brief, emphasis));
    const key = prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const audit = lintImagePrompt(prompt, brief.category);
    candidates.push({
      prompt,
      emphasis,
      audit,
      score: scorePromptAudit(audit),
    });
  }

  // Stable sort: equal scores keep the balanced variant first.
  return candidates.sort((a, b) => b.score - a.score);
}

function withEmphasis(brief: VisualBrief, emphasis: PromptEmphasis): VisualBrief {
  if (emphasis === "balanced") return brief;

  const anchors = {
    ...brief.visualAnchors,
    materials: [...brief.visualAnchors.materials],
    palette: [...brief.visualAnchors.palette],
    mood: [...brief.visualAnchors.mood],
  };

  if (emphasis === "lighting") {
    anchors.lighting = append(anchors.lighting, "strong directional light and deep shadows");
  } else if (emphasis === "composition") {
    anchors.composition = append(anchors.composition, "strong focal hierarchy and layered depth");
  } else if (emphasis === "material") {
    anchors.materials = unique([
      ...anchors.materials,
      "tactile material detail",
      "crisp reflections",
    ]);
  } else if (emphasis === "mood") {
    anchors.mood = unique([...anchors.mood, "cohesive cinematic atmosphere"]);
  }

  return { ...brief, visualAnchors: anchors };
}

function append(base: string, extra: string): string {
  const value = base.trim();
  if (!value) return extra;
  if (value.toLowerCase().includes(extra.toLowerCase())) return value;
  return `${value}, ${extra}`;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
