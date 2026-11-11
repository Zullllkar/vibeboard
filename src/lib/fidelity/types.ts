/**
 * Fidelity v2 — deterministic DOM/computed-style comparison.
 *
 * This is the shadow layer: the existing VLM review stays the primary score
 * until the DOM comparator is calibrated against human labels.
 */

import { z } from "zod";

export const DomBBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const DomStylesSchema = z.object({
  color: z.string().default(""),
  backgroundColor: z.string().default(""),
  fontSize: z.number().default(0),
  fontWeight: z.number().default(0),
  lineHeight: z.number().default(0),
  letterSpacing: z.number().default(0),
  fontFamily: z.string().default(""),
  borderRadius: z.number().default(0),
  boxShadow: z.string().default(""),
  opacity: z.number().default(1),
  zIndex: z.number().default(0),
  display: z.string().default(""),
  position: z.string().default(""),
});

export const DomNodeSnapshotSchema = z.object({
  /** Stable-ish CSS path for fix hints. */
  path: z.string(),
  tag: z.string(),
  role: z.string().optional(),
  name: z.string().optional(),
  /** Leaf text only, normalized and capped by the extractor. */
  text: z.string().optional(),
  bbox: DomBBoxSchema,
  styles: DomStylesSchema,
  src: z.string().optional(),
  visible: z.boolean().default(true),
});

export const DomSnapshotSchema = z.object({
  version: z.literal(1),
  url: z.string().default(""),
  width: z.number().positive(),
  height: z.number().positive(),
  nodes: z.array(DomNodeSnapshotSchema),
  truncated: z.boolean().optional(),
  capturedAt: z.string(),
});

export type DomBBox = z.infer<typeof DomBBoxSchema>;
export type DomStyles = z.infer<typeof DomStylesSchema>;
export type DomNodeSnapshot = z.infer<typeof DomNodeSnapshotSchema>;
export type DomSnapshot = z.infer<typeof DomSnapshotSchema>;

export const FidelityDeviationSchema = z.object({
  slot: z.string().default(""),
  kind: z
    .enum([
      "spacing",
      "color",
      "typography",
      "missing",
      "extra",
      "hierarchy",
      "content",
      "other",
    ])
    .default("other"),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  expected: z.string().default(""),
  actual: z.string().default(""),
  fixHint: z.string().default(""),
  selector: z.string().optional(),
});

export const FidelityDimensionSchema = z.object({
  score: z.number().min(0).max(10),
  weight: z.number().min(0).max(1),
});

export const FidelityReportV2Schema = z.object({
  version: z.literal(2),
  source: z.literal("dom"),
  score: z.number().min(0).max(10),
  verdict: z.enum(["pass", "needs-work", "off-track"]),
  dimensions: z.object({
    structure: FidelityDimensionSchema,
    geometry: FidelityDimensionSchema,
    color: FidelityDimensionSchema,
    content: FidelityDimensionSchema,
  }),
  deviations: z.array(FidelityDeviationSchema),
  matchedSlots: z.array(z.string()),
  unmatchedSlots: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  viewport: z.object({ width: z.number(), height: z.number() }),
  domHash: z.string().optional(),
  createdAt: z.string(),
});

export type FidelityDeviation = z.infer<typeof FidelityDeviationSchema>;
export type FidelityDimension = z.infer<typeof FidelityDimensionSchema>;
export type FidelityReportV2 = z.infer<typeof FidelityReportV2Schema>;
