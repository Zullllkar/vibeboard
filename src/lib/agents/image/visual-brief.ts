/**
 * VisualBrief — the structured visual direction for an image asset.
 *
 * The image planner must not hand the image model a long requirements doc.
 * It should hand it a small set of visual anchors: what it looks like, not
 * what components exist or what copy to render.
 */

import { z } from "zod";

export const VisualBriefCategorySchema = z.enum([
  "ui",
  "product",
  "promo",
  "social",
  "concept",
  "moodboard",
]);

export const VisualAnchorsSchema = z.object({
  /** e.g. "soft directional daylight from top-left" */
  lighting: z.string().default(""),
  /** e.g. ["matte paper", "frosted glass"] */
  materials: z.array(z.string()).default([]),
  /** e.g. ["warm off-white", "muted cobalt"] */
  palette: z.array(z.string()).default([]),
  /** e.g. "centered card, generous negative space" */
  composition: z.string().default(""),
  /** e.g. "35mm, shallow depth of field" */
  camera: z.string().optional(),
  /** e.g. ["calm", "expensive", "editorial"] */
  mood: z.array(z.string()).default([]),
});

export const VisualBriefSchema = z.object({
  category: VisualBriefCategorySchema,
  /** What is depicted. Keep it short and visual. */
  subject: z.string().min(1),
  visualAnchors: VisualAnchorsSchema,
  /**
   * none    = the image should contain no text
   * overlay = leave clean space; real copy is rendered in code/canvas
   */
  textPolicy: z.enum(["none", "overlay"]).default("none"),
  /** User uploads / canvas references / brand library ids. */
  referenceIds: z.array(z.string()).default([]),
  aspectRatio: z.string().default("16:9"),
  /** Product shape/logo/color that must survive a reference-guided edit. */
  mustKeep: z.array(z.string()).default([]),
  /** Concrete artifacts to avoid, e.g. "watermark", "extra fingers". */
  mustAvoid: z.array(z.string()).default([]),
});

export type VisualBriefCategory = z.infer<typeof VisualBriefCategorySchema>;
export type VisualAnchors = z.infer<typeof VisualAnchorsSchema>;
export type VisualBrief = z.infer<typeof VisualBriefSchema>;

/** Best-effort category inference for legacy free-string tasks. */
export function inferVisualCategory(input: {
  role?: string;
  targetId?: string;
  prompt?: string;
}): VisualBriefCategory {
  if (input.targetId === "ui-visual") return "ui";
  if (input.targetId === "product-shot") return "product";
  if (input.targetId === "promo-kv") return "promo";
  if (input.targetId === "social-cover") return "social";
  if (input.targetId === "game-art") return "concept";
  if (input.targetId === "style-board") return "moodboard";

  const text = (input.prompt ?? "").toLowerCase();
  if (/\b(ui|screen|app|dashboard|login|sign[- ]?in|landing|pricing|onboarding)\b/.test(text)) {
    return "ui";
  }
  if (/\b(product|bottle|headphones|packshot|serum)\b/.test(text)) return "product";
  if (/\b(poster|campaign|key visual|kv)\b/.test(text)) return "promo";
  if (/\b(xiaohongshu|youtube|thumbnail|cover|social)\b/.test(text)) return "social";
  if (/\b(character|concept art|environment|fantasy|cyberpunk)\b/.test(text)) return "concept";
  if (/\b(moodboard|mood board|brand board)\b/.test(text)) return "moodboard";

  if (input.role === "product-shot") return "product";
  if (input.role === "hero") return "promo";
  if (input.role === "background") return "concept";
  return "concept";
}
