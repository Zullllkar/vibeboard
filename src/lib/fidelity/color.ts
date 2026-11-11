/**
 * Small color utilities for deterministic fidelity checks.
 * CIEDE2000 is used instead of RGB distance because the latter does not match
 * perceived color difference (e.g. dark blues look much closer than RGB says).
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseCssColor(input: string): RgbColor | null {
  const value = input.trim().toLowerCase();
  if (!value || value === "transparent" || value === "none") return null;

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split("").map((ch) => parseInt(ch + ch, 16));
      return { r, g, b, a: a === undefined ? 1 : a / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }

  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) return null;
  const parts = match[1].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;

  const channel = (part: string) =>
    part.endsWith("%")
      ? Math.round((parseFloat(part) / 100) * 255)
      : parseFloat(part);
  const alpha = (part: string | undefined) => {
    if (!part) return 1;
    const n = part.endsWith("%") ? parseFloat(part) / 100 : parseFloat(part);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
  };

  const r = channel(parts[0]);
  const g = channel(parts[1]);
  const b = channel(parts[2]);
  if (![r, g, b].every(Number.isFinite)) return null;

  return {
    r: clampByte(r),
    g: clampByte(g),
    b: clampByte(b),
    a: alpha(parts[3]),
  };
}

/** ΔE00 between two CSS colors; null when either color cannot be parsed. */
export function colorDistanceCss(a: string, b: string): number | null {
  const left = parseCssColor(a);
  const right = parseCssColor(b);
  if (!left || !right) return null;
  // A transparent surface is not a meaningful color comparison.
  if (left.a < 0.1 || right.a < 0.1) return null;
  return ciede2000(left, right);
}

/** ΔE00 between two RGB colors. */
export function ciede2000(left: RgbColor, right: RgbColor): number {
  const lab1 = rgbToLab(left);
  const lab2 = rgbToLab(right);
  return deltaE00(lab1, lab2);
}

/** WCAG relative luminance / contrast ratio, useful for text-on-surface checks. */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

interface Lab {
  l: number;
  a: number;
  b: number;
}

function rgbToLab(color: RgbColor): Lab {
  const r = srgbToLinear(color.r / 255);
  const g = srgbToLinear(color.g / 255);
  const b = srgbToLinear(color.b / 255);

  // D65
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  const fx = labF(x / 0.95047);
  const fy = labF(y / 1);
  const fz = labF(z / 1.08883);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function deltaE00(left: Lab, right: Lab): number {
  const { l: l1, a: a1, b: b1 } = left;
  const { l: l2, a: a2, b: b2 } = right;

  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));

  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);

  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);

  const deltaLp = l2 - l1;
  const deltaCp = c2p - c1p;

  let deltaHp = 0;
  if (c1p * c2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) deltaHp = diff;
    else if (diff > 180) deltaHp = diff - 360;
    else deltaHp = diff + 360;
  }

  const deltaHpPrime = 2 * Math.sqrt(c1p * c2p) * Math.sin(degToRad(deltaHp / 2));

  const lBarP = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;

  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    const diff = Math.abs(h1p - h2p);
    if (diff <= 180) hBarP = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2;
    else hBarP = (h1p + h2p - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(degToRad(hBarP - 30)) +
    0.24 * Math.cos(degToRad(2 * hBarP)) +
    0.32 * Math.cos(degToRad(3 * hBarP + 6)) -
    0.2 * Math.cos(degToRad(4 * hBarP - 63));

  const deltaTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(degToRad(2 * deltaTheta)) * rc;

  return Math.sqrt(
    (deltaLp / sl) ** 2 +
      (deltaCp / sc) ** 2 +
      (deltaHpPrime / sh) ** 2 +
      rt * (deltaCp / sc) * (deltaHpPrime / sh),
  );
}

function hueAngle(b: number, a: number): number {
  if (a === 0 && b === 0) return 0;
  const angle = radToDeg(Math.atan2(b, a));
  return angle >= 0 ? angle : angle + 360;
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function labF(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

function relativeLuminance(color: RgbColor): number {
  const r = srgbToLinear(color.r / 255);
  const g = srgbToLinear(color.g / 255);
  const b = srgbToLinear(color.b / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function radToDeg(value: number): number {
  return (value * 180) / Math.PI;
}
