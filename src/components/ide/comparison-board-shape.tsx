"use client";

import { createShapeId, type RecordProps, type TLBaseShape } from "@/lib/tldraw-compat";
import { HTMLContainer, Rectangle2d, ShapeUtil, T } from "tldraw";
import {
  applyComparisonDrag,
  beginComparisonDrag,
  endComparisonDrag,
} from "@/lib/canvas/comparison-drag";
import { useCanvasChromePalette } from "@/lib/canvas/use-canvas-chrome";
import { useProjectStore } from "@/store/project-store";
import { rejectComparisonEnds } from "@/lib/targets/comparison-axis";

export type ComparisonBoardShape = TLBaseShape<
  "comparison-board",
  {
    w: number;
    h: number;
    boardId: string;
    projectId: string;
    question: string;
    memberAssetIds: string;
    memberNoteIds: string;
  }
>;

function splitIds(value: string): string[] {
  return value.split(",").map((id) => id.trim()).filter(Boolean);
}

export class ComparisonBoardShapeUtil extends ShapeUtil<ComparisonBoardShape> {
  static type = "comparison-board" as const;

  static props: RecordProps<ComparisonBoardShape> = {
    w: T.number,
    h: T.number,
    boardId: T.string,
    projectId: T.string,
    question: T.string,
    memberAssetIds: T.string,
    memberNoteIds: T.string,
  };

  getDefaultProps(): ComparisonBoardShape["props"] {
    return {
      w: 720,
      h: 280,
      boardId: "",
      projectId: "",
      question: "",
      memberAssetIds: "",
      memberNoteIds: "",
    };
  }

  override canEdit() {
    return false;
  }

  override canResize() {
    return false;
  }

  getGeometry(shape: ComparisonBoardShape): Rectangle2d {
    return new Rectangle2d({
      width: Math.max(1, shape.props.w),
      height: Math.max(1, shape.props.h),
      isFilled: true,
    });
  }

  override onTranslateStart(shape: ComparisonBoardShape) {
    beginComparisonDrag(
      this.editor,
      shape.id,
      splitIds(shape.props.memberAssetIds),
      splitIds(shape.props.memberNoteIds)
    );
  }

  override onTranslate(initial: ComparisonBoardShape, current: ComparisonBoardShape) {
    applyComparisonDrag(
      this.editor,
      current.id,
      current.x - initial.x,
      current.y - initial.y
    );
  }

  override onTranslateEnd(_initial: ComparisonBoardShape, current: ComparisonBoardShape) {
    endComparisonDrag(current.id);
  }

  component(shape: ComparisonBoardShape) {
    return <ComparisonBoardView shape={shape} />;
  }

  indicator(shape: ComparisonBoardShape) {
    const p = new Path2D();
    p.rect(0, 0, shape.props.w, shape.props.h);
    return p;
  }
}

function ComparisonBoardView({ shape }: { shape: ComparisonBoardShape }) {
  const c = useCanvasChromePalette();
  const project = useProjectStore((s) => s.projects[shape.props.projectId] ?? null);
  const canReject =
    project?.id === shape.props.projectId && project.targetId !== "style-board";
  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: shape.props.w,
        height: shape.props.h,
        boxSizing: "border-box",
        pointerEvents: "none",
        borderRadius: 22,
        border: `1px solid ${c.border}`,
        background: "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          margin: "12px 16px",
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: c.text }}>
          {shape.props.question || "这一轮只问一句"}
        </p>
        {canReject ? (
          <button
            type="button"
            style={{
              pointerEvents: "auto",
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.text,
              borderRadius: 999,
              fontSize: 12,
              padding: "4px 10px",
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              if (!project) return;
              useProjectStore.getState().upsert(rejectComparisonEnds(project));
            }}
          >
            两边都不要
          </button>
        ) : null}
      </div>
    </HTMLContainer>
  );
}

export function makeComparisonBoardShape(input: {
  boardId: string;
  projectId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  question: string;
  memberAssetIds: string[];
  memberNoteIds: string[];
}) {
  return {
    id: createShapeId(`comparison-board:${input.boardId}`),
    type: "comparison-board" as const,
    x: input.x,
    y: input.y,
    props: {
      w: input.w,
      h: input.h,
      boardId: input.boardId,
      projectId: input.projectId,
      question: input.question,
      memberAssetIds: input.memberAssetIds.join(","),
      memberNoteIds: input.memberNoteIds.join(","),
    },
  };
}
