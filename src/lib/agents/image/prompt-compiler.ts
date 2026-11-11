/**
 * Compile a VisualBrief into a short, visual-only image prompt.
 *
 * Deliberately no model routing and no model-specific syntax: this is the
 * open-source, provider-agnostic baseline. A provider adapter can append
 * its own parameters later without changing the brief.
 */

import { getPromptPolicy } from "./prompt-policy";
import type { VisualBrief } from "./visual-brief";

export function compileVisualBrief(brief: VisualBrief): string {
  const parts: string[] = [];
  const subject = clean(brief.subject);
  if (subject) parts.push(subject);

  const anchors = brief.visualAnchors;
  const lighting = clean(anchors.lighting);
  if (lighting) parts.push(lighting);

  const materials = cleanList(anchors.materials);
  if (materials.length) parts.push(materials.join(", "));

  const palette = cleanList(anchors.palette);
  if (palette.length) parts.push(`${palette.join(" and ")} palette`);

  const composition = clean(anchors.composition);
  if (composition) parts.push(composition);

  const camera = clean(anchors.camera ?? "");
  if (camera) parts.push(camera);

  const mood = cleanList(anchors.mood);
  if (mood.length) parts.push(mood.join(", "));

  const mustKeep = cleanList(brief.mustKeep);
  if (mustKeep.length) parts.push(`keep ${mustKeep.join(", ")} unchanged`);

  const mustAvoid = cleanList(brief.mustAvoid);
  if (mustAvoid.length) parts.push(`avoid ${mustAvoid.join(", ")}`);

  if (brief.textPolicy === "overlay") {
    parts.push("empty space for text overlay");
  } else {
    parts.push("no added text, no watermark");
  }

  if (brief.aspectRatio) parts.push(brief.aspectRatio);

  const prompt = dedupeParts(parts).join(", ");
  return enforceBudget(prompt, brief);
}

/**
 * Keep the prompt within the category budget without cutting a token in half.
 * If a brief is too long we drop the least important trailing anchors first.
 */
function enforceBudget(prompt: string, brief: VisualBrief): string {
  const policy = getPromptPolicy(brief.category);
  const words = countWords(prompt);
  if (words <= policy.maxWords) return prompt;

  const fallbackParts = [
    clean(brief.subject),
    clean(brief.visualAnchors.lighting),
    cleanList(brief.visualAnchors.materials).join(", "),
    `${cleanList(brief.visualAnchors.palette).join(" and ")} palette`,
    clean(brief.visualAnchors.composition),
    brief.mustKeep.length ? `keep ${cleanList(brief.mustKeep).join(", ")} unchanged` : "",
    brief.textPolicy === "overlay" ? "empty space for text overlay" : "no added text, no watermark",
    brief.aspectRatio,
  ].filter(Boolean);

  const fallback = fallbackParts.join(", ");
  if (countWords(fallback) <= policy.maxWords) return fallback;

  // Last resort: truncate by words. Better a slightly terse prompt than a
  // prompt that silently loses the last half in a provider's encoder.
  return fallback.split(/\s+/).slice(0, policy.maxWords).join(" ");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const cjk = (trimmed.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latin = trimmed
    .replace(/[\u3400-\u9fff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + latin;
}

function clean(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[,.;\s]+|[,.;\s]+$/g, "")
    .trim();
}

function cleanList(values: string[]): string[] {
  return values.map(clean).filter(Boolean);
}

function dedupeParts(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const value = clean(part);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
