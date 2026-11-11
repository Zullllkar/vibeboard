import { nanoid } from "nanoid";
import type { ProjectFile } from "@/lib/project/schema";
import { comparisonRound } from "@/lib/targets/comparison-axis";

export interface BoardBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 36;
const TITLE = 40;

export function comparisonBoardRect(boxes: BoardBox[]): BoardBox {
  if (boxes.length === 0) {
    return { x: 0, y: 0, w: 720, h: 280 };
  }
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  return {
    x: minX - PAD,
    y: minY - PAD - TITLE,
    w: maxX - minX + PAD * 2,
    h: maxY - minY + PAD * 2 + TITLE,
  };
}

export function addComparisonBoard(
  project: ProjectFile,
  input: {
    question: string;
    memberAssetIds: string[];
    memberNoteIds?: string[];
    x: number;
    y: number;
  }
): ProjectFile {
  return {
    ...project,
    comparisonBoards: [
      ...(project.comparisonBoards ?? []),
      {
        id: nanoid(10),
        question: input.question.trim() || "这一轮只问一句",
        memberAssetIds: input.memberAssetIds,
        memberNoteIds: input.memberNoteIds ?? [],
        x: input.x,
        y: input.y,
        w: 720,
        h: 280,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/** 风格探索的四个角生成后收成一块对照组。不绑定 skill。 */
export function attachStyleCornerBoard(project: ProjectFile): ProjectFile {
  if (project.targetId !== "style-board") return project;
  const groups = new Map<string, string[]>();
  for (const asset of project.assets ?? []) {
    if (!asset.prompt.includes("四个角之一")) continue;
    if (asset.status === "discarded" || asset.status === "failed" || asset.status === "cancelled") {
      continue;
    }
    const key = asset.batchId || "loose";
    const ids = groups.get(key) ?? [];
    ids.push(asset.id);
    groups.set(key, ids);
  }
  let next = project;
  for (const ids of groups.values()) {
    if (ids.length !== 4) continue;
    const sorted = [...ids].sort();
    const already = (next.comparisonBoards ?? []).some((board) => {
      const members = [...board.memberAssetIds].sort();
      return members.length === 4 && members.every((id, index) => id === sorted[index]);
    });
    if (already) continue;
    const noteIds = (next.canvasNotes ?? [])
      .filter((note) => note.parentAssetId && ids.includes(note.parentAssetId))
      .map((note) => note.id);
    next = addComparisonBoard(next, {
      question: comparisonRound("style-board", 1).question,
      memberAssetIds: ids,
      memberNoteIds: noteIds,
      x: next.comparisonBoards?.length ? 40 : 0,
      y: next.comparisonBoards?.length ? 40 : 0,
    });
  }
  return next;
}

export function persistComparisonBoardLayout(
  boards: ProjectFile["comparisonBoards"],
  shapes: Array<{
    type: string;
    x: number;
    y: number;
    props: { boardId?: string; w?: number; h?: number };
  }>
): ProjectFile["comparisonBoards"] {
  if (!boards?.length) return boards;
  const byId = new Map(
    shapes
      .filter((shape) => shape.type === "comparison-board" && shape.props.boardId)
      .map((shape) => [shape.props.boardId!, shape])
  );
  return boards.map((board) => {
    const shape = byId.get(board.id);
    if (!shape) return board;
    return {
      ...board,
      x: shape.x,
      y: shape.y,
      w: shape.props.w ?? board.w,
      h: shape.props.h ?? board.h,
    };
  });
}
