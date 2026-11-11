"use client";

import { useMemo, useState } from "react";
import { autoFixImagePrompt } from "@/lib/agents/image/prompt-fixer";
import {
  lintImagePrompt,
  type PromptIssue,
  scorePromptAudit,
} from "@/lib/agents/image/prompt-linter";
import { getPromptPolicy } from "@/lib/agents/image/prompt-policy";
import type { VisualBriefCategory } from "@/lib/agents/image/visual-brief";

export function PromptAuditPanel({
  prompt,
  category,
  compact = false,
  className = "",
  onApplyFix,
}: {
  prompt: string;
  category: VisualBriefCategory;
  compact?: boolean;
  className?: string;
  /** When provided, shows a conservative one-click fix. */
  onApplyFix?: (prompt: string) => void;
}) {
  const [lastFix, setLastFix] = useState<{ before: string; after: string } | null>(null);

  const audit = useMemo(
    () => (prompt.trim() ? lintImagePrompt(prompt, category) : null),
    [prompt, category],
  );
  const fix = useMemo(
    () => (onApplyFix && prompt.trim() ? autoFixImagePrompt(prompt, category) : null),
    [onApplyFix, prompt, category],
  );

  if (!audit) return null;

  const score = scorePromptAudit(audit);
  const policy = getPromptPolicy(category);
  const canFix = Boolean(onApplyFix && fix && fix.changes.length > 0 && fix.prompt !== prompt);
  const undoable = Boolean(lastFix && lastFix.after === prompt && onApplyFix);
  const tone =
    score >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 60
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  const barTone =
    audit.visualTokenRatio >= policy.minVisualTokenRatio
      ? "bg-emerald-500"
      : audit.visualTokenRatio >= policy.minVisualTokenRatio * 0.75
        ? "bg-amber-500"
        : "bg-red-500";

  const applyFix = () => {
    if (!fix || !onApplyFix || !canFix) return;
    const before = prompt;
    onApplyFix(fix.prompt);
    setLastFix({ before, after: fix.prompt });
  };

  const undoFix = () => {
    if (!lastFix || !onApplyFix) return;
    onApplyFix(lastFix.before);
    setLastFix(null);
  };

  return (
    <div
      className={`mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--muted)]">
            PROMPT 体检
          </span>
          <span className={`text-[12px] font-semibold tabular-nums ${tone}`}>{score}/100</span>
        </div>
        <span className="text-[11px] text-[var(--muted)] tabular-nums">
          {audit.wordCount} 词 · 视觉密度 {Math.round(audit.visualTokenRatio * 100)}%
        </span>
      </div>

      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className={`h-full rounded-full ${barTone}`}
          style={{ width: `${Math.max(4, Math.round(audit.visualTokenRatio * 100))}%` }}
        />
      </div>

      {audit.issues.length === 0 ? (
        <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
          ✓ 没发现明显的布局 / 文案 / 视觉密度问题
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {(compact ? audit.issues.slice(0, 3) : audit.issues.slice(0, 5)).map((issue) => (
            <li
              key={`${issue.code}:${issue.message}:${issue.suggestion ?? ""}`}
              className="flex gap-2 text-[11px] leading-4"
            >
              <span className={`mt-0.5 shrink-0 ${severityTone(issue)}`}>{severityDot(issue)}</span>
              <span className="min-w-0 text-[var(--foreground)]">
                {issue.message}
                {issue.suggestion ? (
                  <span className="text-[var(--muted)]"> — {issue.suggestion}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {audit.issues.length > (compact ? 3 : 5) ? (
        <p className="mt-1.5 text-[10px] text-[var(--muted)]">
          还有 {audit.issues.length - (compact ? 3 : 5)} 条，生成前建议先处理 error。
        </p>
      ) : null}

      {canFix || undoable ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2">
          {canFix ? (
            <button
              type="button"
              onClick={applyFix}
              title={fix?.changes.join("\n")}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              一键修复 · {fix?.changes.length} 项
            </button>
          ) : null}
          {undoable ? (
            <button
              type="button"
              onClick={undoFix}
              className="text-[11px] text-[var(--muted)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
            >
              撤销修复
            </button>
          ) : null}
          {canFix && !undoable ? (
            <span className="text-[10px] text-[var(--muted)]">
              只删问题片段、补默认锚点，不改画面主体
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function severityDot(issue: PromptIssue): string {
  return issue.severity === "error" ? "●" : issue.severity === "warning" ? "●" : "○";
}

function severityTone(issue: PromptIssue): string {
  return issue.severity === "error"
    ? "text-red-600 dark:text-red-400"
    : issue.severity === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : "text-[var(--muted)]";
}
