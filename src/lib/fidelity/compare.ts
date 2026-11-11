/**
 * Deterministic DOM ↔ Layout IR comparison.
 *
 * This is intentionally conservative: it only compares code slots that have a
 * clear DOM counterpart, and it reports geometry/color/content deviations with
 * selectors. It does not try to judge "visual polish" — that stays with the VLM.
 */

import { colorDistanceCss } from "./color";
import type {
  FidelityDeviation,
  FidelityDimension,
  FidelityReportV2,
  DomNodeSnapshot,
  DomSnapshot,
} from "./types";
import type { LayoutIR, LayoutNode, CodeSlot } from "@/lib/handoff/layout-ir";

const GEOMETRY_WEIGHT = 0.35;
const STRUCTURE_WEIGHT = 0.3;
const COLOR_WEIGHT = 0.2;
const CONTENT_WEIGHT = 0.15;

interface Match {
  slot: CodeSlot;
  node: DomNodeSnapshot;
  iou: number;
}

export function compareDomToLayout(
  layout: LayoutIR | undefined,
  dom: DomSnapshot | undefined,
): FidelityReportV2 | null {
  if (!layout || !dom) return null;
  const slots = layout.nodes.filter(isCodeSlot);
  if (slots.length === 0 || dom.nodes.length === 0) return null;

  const nodes = dom.nodes.filter(isComparableNode);
  const matches = matchSlots(slots, nodes);
  const matchedSlots = new Set(matches.map((match) => match.slot.id));
  const unmatchedSlots = slots.filter((slot) => !matchedSlots.has(slot.id));

  const deviations: FidelityDeviation[] = [];

  for (const slot of unmatchedSlots) {
    deviations.push({
      slot: slot.id,
      kind: "missing",
      severity: "high",
      expected: `region ${formatBBox(slot.bbox)}`,
      actual: "not found in DOM",
      fixHint: `Add the "${slot.id}" region from the approved mockup.`,
    });
  }

  let geometryPenalty = 0;
  let colorPenalty = 0;
  let contentPenalty = 0;
  let geometryCount = 0;
  let colorCount = 0;
  let contentCount = 0;

  for (const match of matches) {
    const { slot, node, iou } = match;

    if (iou < 0.9) {
      const severity = iou < 0.5 ? "high" : iou < 0.75 ? "medium" : "low";
      geometryPenalty += severity === "high" ? 2.5 : severity === "medium" ? 1.2 : 0.4;
      geometryCount += 1;
      deviations.push({
        slot: slot.id,
        kind: "spacing",
        severity,
        expected: formatBBox(slot.bbox),
        actual: formatBBox(node.bbox),
        fixHint: `Move/resize "${slot.id}" to the mockup bbox (iou ${iou.toFixed(2)}).`,
        selector: node.path,
      });
    }

    if (slot.swatch?.dominant) {
      const actualColor = pickComparableColor(node);
      const distance = actualColor
        ? colorDistanceCss(slot.swatch.dominant, actualColor)
        : null;
      if (distance !== null && distance > 2) {
        const severity = distance > 8 ? "high" : distance > 4 ? "medium" : "low";
        colorPenalty += severity === "high" ? 2 : severity === "medium" ? 1 : 0.3;
        colorCount += 1;
        deviations.push({
          slot: slot.id,
          kind: "color",
          severity,
          expected: slot.swatch.dominant,
          actual: actualColor ?? "unknown",
          fixHint: `Change "${slot.id}" color to ${slot.swatch.dominant} (ΔE00 ${distance.toFixed(1)}).`,
          selector: node.path,
        });
      }
    }

    if (slot.copy?.trim()) {
      const similarity = textSimilarity(slot.copy, node.text ?? "");
      if (similarity < 0.75) {
        const severity = similarity < 0.4 ? "high" : similarity < 0.6 ? "medium" : "low";
        contentPenalty += severity === "high" ? 2 : severity === "medium" ? 1 : 0.3;
        contentCount += 1;
        deviations.push({
          slot: slot.id,
          kind: "content",
          severity,
          expected: slot.copy,
          actual: node.text ?? "(empty)",
          fixHint: `Render the exact copy "${slot.copy}" in "${slot.id}".`,
          selector: node.path,
        });
      }
    }
  }

  const structureScore = clamp10(10 - unmatchedSlots.length * 2.5);
  const geometryScore =
    geometryCount === 0 ? 10 : clamp10(10 - geometryPenalty / geometryCount);
  const colorScore = colorCount === 0 ? 10 : clamp10(10 - colorPenalty / colorCount);
  const contentScore =
    contentCount === 0 ? 10 : clamp10(10 - contentPenalty / contentCount);

  const weighted =
    structureScore * STRUCTURE_WEIGHT +
    geometryScore * GEOMETRY_WEIGHT +
    colorScore * COLOR_WEIGHT +
    contentScore * CONTENT_WEIGHT;
  const missingPenalty = Math.min(4, unmatchedSlots.length * 3);
  const highPenalty = Math.min(
    2,
    deviations.filter((deviation) => deviation.severity === "high" && deviation.kind !== "missing")
      .length * 0.5,
  );
  const score = round1(clamp10(weighted - missingPenalty - highPenalty));

  const matchRate = matches.length / slots.length;
  const viewportMatch =
    Math.abs(dom.width - layout.width) / Math.max(layout.width, 1) < 0.1 &&
    Math.abs(dom.height - layout.height) / Math.max(layout.height, 1) < 0.2;
  const confidence = round2(
    Math.max(
      0,
      Math.min(1, 0.6 * matchRate + 0.3 * (viewportMatch ? 1 : 0.5) + 0.1 * Math.min(1, nodes.length / 50)),
    ),
  );

  return {
    version: 2,
    source: "dom",
    score,
    verdict: score >= 7 ? "pass" : score >= 4 ? "needs-work" : "off-track",
    dimensions: {
      structure: dimension(structureScore, STRUCTURE_WEIGHT),
      geometry: dimension(geometryScore, GEOMETRY_WEIGHT),
      color: dimension(colorScore, COLOR_WEIGHT),
      content: dimension(contentScore, CONTENT_WEIGHT),
    },
    deviations: deviations.slice(0, 12),
    matchedSlots: matches.map((match) => match.slot.id),
    unmatchedSlots: unmatchedSlots.map((slot) => slot.id),
    confidence,
    viewport: { width: dom.width, height: dom.height },
    createdAt: new Date().toISOString(),
  };
}

function isCodeSlot(node: LayoutNode): node is CodeSlot {
  return node.rebuildInCode === true;
}

function isComparableNode(node: DomNodeSnapshot): boolean {
  if (!node.visible) return false;
  if (node.bbox.w <= 0.005 || node.bbox.h <= 0.005) return false;
  return !["html", "body", "script", "style", "head", "meta", "link"].includes(
    node.tag.toLowerCase(),
  );
}

function matchSlots(slots: CodeSlot[], nodes: DomNodeSnapshot[]): Match[] {
  const pairs: Array<{ slot: CodeSlot; node: DomNodeSnapshot; cost: number; iou: number }> = [];
  for (const slot of slots) {
    for (const node of nodes) {
      const iou = bboxIoU(slot.bbox, node.bbox);
      const text = slot.copy?.trim()
        ? textSimilarity(slot.copy, node.text ?? "")
        : 0.5;
      const role = roleSimilarity(slot.role, node);
      const cost = slot.copy?.trim()
        ? 0.55 * (1 - iou) + 0.3 * (1 - text) + 0.15 * (1 - role)
        : 0.8 * (1 - iou) + 0.2 * (1 - role);
      pairs.push({ slot, node, cost, iou });
    }
  }

  pairs.sort((a, b) => a.cost - b.cost);
  const usedSlots = new Set<string>();
  const usedNodes = new Set<string>();
  const matches: Match[] = [];

  for (const pair of pairs) {
    if (pair.cost > 0.55) break;
    if (usedSlots.has(pair.slot.id) || usedNodes.has(pair.node.path)) continue;
    usedSlots.add(pair.slot.id);
    usedNodes.add(pair.node.path);
    matches.push({ slot: pair.slot, node: pair.node, iou: pair.iou });
  }

  return matches;
}

function bboxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function textSimilarity(expected: string, actual: string): number {
  const left = normalizeText(expected);
  const right = normalizeText(actual);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function roleSimilarity(role: string, node: DomNodeSnapshot): number {
  const tag = node.tag.toLowerCase();
  const nodeRole = (node.role ?? "").toLowerCase();
  const groups: Record<string, string[]> = {
    nav: ["nav", "header", "a", "button"],
    cta: ["button", "a", "input"],
    form: ["form", "input", "textarea", "select", "button"],
    footer: ["footer"],
    card: ["div", "section", "article", "li"],
    sidebar: ["aside", "nav", "div"],
    main: ["main", "section", "div"],
  };
  if (role === "other") return 0.6;
  const expected = groups[role] ?? [];
  return expected.includes(tag) || expected.includes(nodeRole) ? 1 : 0.3;
}

function pickComparableColor(node: DomNodeSnapshot): string | null {
  const bg = node.styles.backgroundColor;
  if (bg && !/rgba?\([^)]*,\s*0\s*\)/i.test(bg) && !/transparent/i.test(bg)) {
    return bg;
  }
  return node.styles.color || null;
}

function formatBBox(bbox: { x: number; y: number; w: number; h: number }): string {
  return `x=${(bbox.x * 100).toFixed(1)}% y=${(bbox.y * 100).toFixed(1)}% w=${(bbox.w * 100).toFixed(1)}% h=${(bbox.h * 100).toFixed(1)}%`;
}

function dimension(score: number, weight: number): FidelityDimension {
  return { score: round1(score), weight };
}

function clamp10(value: number): number {
  return Math.max(0, Math.min(10, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
