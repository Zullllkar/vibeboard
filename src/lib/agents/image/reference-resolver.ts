/**
 * Resolve a task's visual references.
 *
 * Priority:
 *   1. `visualBrief.referenceIds` (user pick / canvas citation / brand library)
 *   2. global references already collected for this run
 *
 * If the task explicitly cites references and at least one resolves, the task
 * is treated as exclusive: do not pad the prompt with unrelated global refs.
 */

import "server-only";

import type { ProjectFile } from "@/lib/project/schema";
import { collectProjectReferenceImages } from "../reference-images";
import { resolveReferenceImagesForModel } from "../resolve-reference-images";

export const MAX_TASK_REFERENCES = 4;

export interface ResolveTaskReferenceImagesInput {
  project: ProjectFile | null | undefined;
  projectId: string;
  taskReferenceIds: string[];
  globalReferenceImages: string[];
  max?: number;
  /** Injectable for tests. */
  resolveImages?: (srcs: string[], projectId?: string) => Promise<string[]>;
}

export async function resolveTaskReferenceImages(
  input: ResolveTaskReferenceImagesInput,
): Promise<string[]> {
  const max = Math.max(1, Math.min(input.max ?? MAX_TASK_REFERENCES, MAX_TASK_REFERENCES));
  const taskIds = input.taskReferenceIds.map((id) => id.trim()).filter(Boolean);
  const resolveImages = input.resolveImages ?? resolveReferenceImagesForModel;

  if (taskIds.length === 0) {
    return dedupe(input.globalReferenceImages).slice(0, max);
  }

  const collected = collectProjectReferenceImages(input.project, {
    preferIds: taskIds,
    max,
  });

  // collectProjectReferenceImages pads with unrelated project refs when none
  // of the cited ids resolve. For a task-specific brief we do not want that:
  // either use the cited refs, or fall back to the run's global refs.
  const citedIds = collected.ids.filter((id) => taskIds.includes(id));
  if (citedIds.length === 0) {
    return dedupe(input.globalReferenceImages).slice(0, max);
  }

  const resolvedTask = await resolveImages(collected.srcs, input.projectId);
  return dedupe(resolvedTask).slice(0, max);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
