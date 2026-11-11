/**
 * Prompt linter — catches the failure modes that make image prompts ugly:
 * layout leakage, UI copy leakage, generic adjectives, abstract negatives,
 * low visual density and missing visual anchors.
 *
 * This is a heuristic, not a model. It is intentionally deterministic and
 * cheap so it can run before every generation.
 */

import { z } from "zod";
import { countWords } from "./prompt-compiler";
import { getPromptPolicy } from "./prompt-policy";
import { type VisualBriefCategory, VisualBriefCategorySchema } from "./visual-brief";

export const PromptIssueSchema = z.object({
  code: z.enum([
    "too-long",
    "too-short",
    "low-visual-density",
    "layout-or-copy",
    "quoted-copy",
    "generic-language",
    "abstract-negative",
    "missing-anchor",
    "vtr-skipped",
  ]),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  suggestion: z.string().optional(),
});

export const PromptAuditSchema = z.object({
  ok: z.boolean(),
  category: VisualBriefCategorySchema,
  wordCount: z.number().int().nonnegative(),
  visualTokenRatio: z.number().min(0).max(1),
  issues: z.array(PromptIssueSchema),
});

export type PromptIssue = z.infer<typeof PromptIssueSchema>;
export type PromptAudit = z.infer<typeof PromptAuditSchema>;

const VISUAL_TERMS = new Set([
  // light
  "light",
  "lights",
  "lighting",
  "daylight",
  "sunlight",
  "sun",
  "shadow",
  "shadows",
  "glow",
  "backlight",
  "rim",
  "softbox",
  "overcast",
  "dusk",
  "dawn",
  "golden",
  "volumetric",
  "fog",
  "mist",
  "ambient",
  "directional",
  "window",
  // material
  "paper",
  "glass",
  "metal",
  "wood",
  "stone",
  "fabric",
  "ceramic",
  "acrylic",
  "matte",
  "glossy",
  "brushed",
  "translucent",
  "frosted",
  "travertine",
  "silk",
  "leather",
  "concrete",
  "chrome",
  "steel",
  "plastic",
  // color
  "warm",
  "cool",
  "muted",
  "pastel",
  "monochrome",
  "contrast",
  "saturation",
  "palette",
  "color",
  "colors",
  "cobalt",
  "indigo",
  "coral",
  "amber",
  "jade",
  "cream",
  "charcoal",
  "ivory",
  "sand",
  "graphite",
  "violet",
  "cyan",
  "lime",
  "green",
  "blue",
  "red",
  "black",
  "white",
  "gray",
  "grey",
  "gold",
  // composition
  "centered",
  "center",
  "symmetrical",
  "asymmetrical",
  "negative",
  "space",
  "layered",
  "layers",
  "close-up",
  "wide",
  "macro",
  "depth",
  "field",
  "bokeh",
  "frame",
  "composition",
  "grid",
  "minimal",
  "minimalism",
  "editorial",
  "cinematic",
  "painterly",
  "photographic",
  "studio",
  "product",
  "portrait",
  "landscape",
  "wide-angle",
  "three-quarter",
  "full-body",
  "turnaround",
  // camera
  "35mm",
  "50mm",
  "85mm",
  "lens",
  "aperture",
  "shutter",
  "film",
  "dslr",
  "shot",
  "camera",
  // mood / style
  "calm",
  "expensive",
  "premium",
  "quiet",
  "serene",
  "dreamy",
  "gritty",
  "lonely",
  "epic",
  "mythic",
  "playful",
  "energetic",
  "cozy",
  "aspirational",
  "technical",
  "precise",
  "refined",
  "contemplative",
  "futuristic",
  "moody",
  "dramatic",
  "soft",
  "hard",
  "crisp",
  "editorial",
  "brutalist",
  "bauhaus",
  "swiss",
  "japandi",
  "vintage",
  "retro",
  "contemporary",
  "classic",
  "luxury",
  "high-end",
]);

const GENERIC_TERMS = [
  "modern",
  "clean",
  "professional",
  "high-quality",
  "high quality",
  "stunning",
  "beautiful",
  "amazing",
  "perfect",
  "cutting-edge",
  "8k",
  "ultra detailed",
  "best",
  "award-winning",
  "masterpiece",
  "trending",
];

const ABSTRACT_NEGATIVE = /\b(no|avoid|without)\s+(clutter|mess|bad design|ugly|generic|boring)\b/i;

const QUOTED_COPY = /["“][^"”]{2,}["”]/;

const ANCHOR_TERMS: Record<string, RegExp> = {
  lighting:
    /\b(light|lighting|daylight|sunlight|shadow|glow|backlight|rim|softbox|overcast|dusk|dawn|golden|volumetric|fog|mist|ambient|directional)\b/i,
  materials:
    /\b(paper|glass|metal|wood|stone|fabric|ceramic|acrylic|matte|glossy|brushed|translucent|frosted|travertine|silk|leather|concrete|chrome|steel|plastic)\b/i,
  palette:
    /\b(warm|cool|muted|pastel|monochrome|contrast|saturation|palette|color|cobalt|indigo|coral|amber|jade|cream|charcoal|ivory|sand|graphite|violet|cyan|lime|green|blue|red|black|white|gray|grey|gold)\b/i,
  composition:
    /\b(centered|center|symmetrical|asymmetrical|negative space|layered|close-up|wide|macro|depth of field|bokeh|frame|composition|grid|minimal|editorial|cinematic|studio|three-quarter|full-body|turnaround)\b/i,
  camera: /\b(35mm|50mm|85mm|lens|aperture|shutter|film|dslr|shot|camera|wide-angle)\b/i,
  mood: /\b(calm|expensive|premium|quiet|serene|dreamy|gritty|lonely|epic|mythic|playful|energetic|cozy|aspirational|technical|precise|refined|contemplative|futuristic|moody|dramatic)\b/i,
};

export function scorePromptAudit(audit: PromptAudit): number {
  let score = 50 + audit.visualTokenRatio * 50;
  for (const issue of audit.issues) {
    switch (issue.code) {
      case "layout-or-copy":
        score -= 30;
        break;
      case "generic-language":
        score -= 10;
        break;
      case "low-visual-density":
        score -= 10;
        break;
      case "quoted-copy":
        score -= 8;
        break;
      case "missing-anchor":
        score -= 4;
        break;
      case "too-long":
      case "too-short":
        score -= 5;
        break;
      case "abstract-negative":
        score -= 5;
        break;
      default:
        break;
    }
  }
  if (!audit.ok) score -= 40;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function lintImagePrompt(prompt: string, category: VisualBriefCategory): PromptAudit {
  const policy = getPromptPolicy(category);
  const text = prompt.trim();
  const wordCount = countWords(text);
  const issues: PromptIssue[] = [];

  if (!text) {
    return {
      ok: false,
      category,
      wordCount: 0,
      visualTokenRatio: 0,
      issues: [
        {
          code: "too-short",
          severity: "error",
          message: "Prompt is empty.",
          suggestion: "Compile a VisualBrief first.",
        },
      ],
    };
  }

  if (wordCount > policy.maxWords) {
    issues.push({
      code: "too-long",
      severity: "warning",
      message: `Prompt has ${wordCount} words; ${policy.label} budget is ${policy.minWords}-${policy.maxWords}.`,
      suggestion: "Remove layout/copy tokens and keep only visual anchors.",
    });
  } else if (wordCount < policy.minWords) {
    issues.push({
      code: "too-short",
      severity: "warning",
      message: `Prompt has ${wordCount} words; ${policy.label} budget is ${policy.minWords}-${policy.maxWords}.`,
      suggestion: "Add a lighting, material, palette or composition anchor.",
    });
  }

  const cjkCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const tokenCount = countTokens(text);
  const nonEnglish = tokenCount > 0 && cjkCount / tokenCount > 0.3;
  const visualTokenRatio = nonEnglish ? 1 : computeVisualTokenRatio(text, tokenCount);

  if (nonEnglish) {
    issues.push({
      code: "vtr-skipped",
      severity: "info",
      message: "Visual token ratio is not evaluated for mostly-Chinese prompts.",
    });
  } else if (visualTokenRatio < policy.minVisualTokenRatio) {
    issues.push({
      code: "low-visual-density",
      severity: "warning",
      message: `Visual token ratio ${Math.round(visualTokenRatio * 100)}% is below ${Math.round(policy.minVisualTokenRatio * 100)}%.`,
      suggestion: "Add concrete lighting, material, palette, composition or camera words.",
    });
  }

  for (const pattern of policy.bannedPatterns) {
    const match = text.match(pattern);
    if (match) {
      issues.push({
        code: "layout-or-copy",
        severity: "error",
        message: `Prompt contains layout/copy instruction "${match[0]}".`,
        suggestion:
          "Move layout to Layout IR and copy to the copy plan; keep the image prompt visual-only.",
      });
      break;
    }
  }

  const quoted = text.match(QUOTED_COPY);
  if (quoted) {
    issues.push({
      code: "quoted-copy",
      severity: "warning",
      message: `Prompt asks the image model to render quoted text ${quoted[0]}.`,
      suggestion: "Use textPolicy=overlay and render the copy in code/canvas.",
    });
  }

  const genericHits = GENERIC_TERMS.filter((term) =>
    new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text),
  );
  if (genericHits.length) {
    issues.push({
      code: "generic-language",
      severity: "warning",
      message: `Generic style words: ${genericHits.join(", ")}.`,
      suggestion: "Replace with concrete visual anchors (lighting, material, palette).",
    });
  }

  const negative = text.match(ABSTRACT_NEGATIVE);
  if (negative) {
    issues.push({
      code: "abstract-negative",
      severity: "warning",
      message: `Abstract negative "${negative[0]}" is hard for image models to follow.`,
      suggestion: 'Use a positive constraint such as "generous negative space".',
    });
  }

  for (const anchor of policy.requiredAnchors) {
    if (!ANCHOR_TERMS[anchor].test(text)) {
      issues.push({
        code: "missing-anchor",
        severity: "warning",
        message: `Missing ${anchor} anchor for ${policy.label}.`,
        suggestion: `Add a concrete ${anchor} description.`,
      });
    }
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    category,
    wordCount,
    visualTokenRatio: round2(visualTokenRatio),
    issues,
  };
}

function computeVisualTokenRatio(text: string, tokenCount: number): number {
  if (tokenCount === 0) return 0;
  const visual = countTokens(text, (token) => VISUAL_TERMS.has(token));
  return round2(visual / tokenCount);
}

function countTokens(text: string, predicate?: (token: string) => boolean): number {
  const tokens = text.toLowerCase().match(/[a-z][a-z-]*|[\u3400-\u9fff]/g) ?? [];
  if (!predicate) return tokens.length;
  return tokens.filter(predicate).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
