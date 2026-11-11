"use client";
import { createShapeId, type RecordProps, type TLBaseShape } from "@/lib/tldraw-compat";

/**
 * 画布文本卡片：脚本 / 文案 / 规则 / 笔记
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { AlignLeft, Palette, ScrollText, Text, Trash2 } from "lucide-react";
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  useEditor,
  useValue,
} from "tldraw";
import { useProjectStore } from "@/store/project-store";
import { useCanvasChromePalette } from "@/lib/canvas/use-canvas-chrome";
import {
  TEXT_NOTE_DEFAULT_H,
  TEXT_NOTE_DEFAULT_W,
  composerPromptForCite,
  composerPromptForTextTask,
  deleteCanvasNote,
  noteKindLabel,
  upsertCanvasNote,
  type CanvasNoteKind,
} from "@/lib/canvas/canvas-notes";
import { useCanvasUiStore } from "@/store/canvas-ui-store";

const CARD_RADIUS = 18;

const editingNoteIds = new Set<string>();
const editingListeners = new Set<() => void>();

function emitTextNoteEditing() {
  for (const listener of editingListeners) listener();
}

export function beginTextNoteEdit(noteId: string) {
  if (!noteId || editingNoteIds.has(noteId)) return;
  editingNoteIds.add(noteId);
  emitTextNoteEditing();
}

function endTextNoteEdit(noteId: string) {
  if (!editingNoteIds.delete(noteId)) return;
  emitTextNoteEditing();
}

function subscribeTextNoteEditing(listener: () => void) {
  editingListeners.add(listener);
  return () => editingListeners.delete(listener);
}

function isTextNoteEditing(noteId: string) {
  return editingNoteIds.has(noteId);
}

export type TextNoteShape = TLBaseShape<
  "text-note",
  {
    w: number;
    h: number;
    noteId: string;
    projectId: string;
  }
>;

export class TextNoteShapeUtil extends ShapeUtil<TextNoteShape> {
  static type = "text-note" as any;

  static props: RecordProps<TextNoteShape> = {
    w: T.number,
    h: T.number,
    noteId: T.string,
    projectId: T.string,
  };

  getDefaultProps(): TextNoteShape["props"] {
    return {
      w: TEXT_NOTE_DEFAULT_W,
      h: TEXT_NOTE_DEFAULT_H,
      noteId: "",
      projectId: "",
    };
  }

  getGeometry(shape: TextNoteShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  canResize = () => true;
  canDelete = () => true;
  canEditInReadonly = () => false;
  hideRotateHandle = () => true;
  canBind = () => false;

  onDoubleClick(shape: TextNoteShape) {
    beginTextNoteEdit(shape.props.noteId);
    return { id: shape.id, type: "text-note" as const };
  }

  component(shape: TextNoteShape) {
    return <TextNoteShapeView shape={shape} />;
  }

  getIndicatorPath(shape: TextNoteShape): Path2D | undefined {
    if (typeof Path2D === "undefined") return undefined;
    const r = CARD_RADIUS;
    const w = shape.props.w;
    const h = shape.props.h;
    const p = new Path2D();
    p.moveTo(r, 0);
    p.lineTo(w - r, 0);
    p.quadraticCurveTo(w, 0, w, r);
    p.lineTo(w, h - r);
    p.quadraticCurveTo(w, h, w - r, h);
    p.lineTo(r, h);
    p.quadraticCurveTo(0, h, 0, h - r);
    p.lineTo(0, r);
    p.quadraticCurveTo(0, 0, r, 0);
    p.closePath();
    return p;
  }
}

const TRY_ACTIONS = [
  { id: "script", label: "脚本", hint: "旁白、对白、过场", Icon: ScrollText },
  { id: "copy", label: "文案", hint: "广告词、品牌、按钮", Icon: AlignLeft },
] as const;

function TextNoteShapeView({ shape }: { shape: TextNoteShape }) {
  const editor = useEditor();
  const c = useCanvasChromePalette();
  const upsertProject = useProjectStore((s) => s.upsert);
  const note = useProjectStore((s) =>
    (s.projects[shape.props.projectId]?.canvasNotes ?? []).find(
      (item) => item.id === shape.props.noteId
    )
  );
  const isSelected = useValue(
    `text-note selected:${shape.id}`,
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id]
  );

  const kind: CanvasNoteKind = note?.kind ?? "note";
  const [title, setTitle] = useState(note?.title ?? noteKindLabel(kind));
  const [body, setBody] = useState(note?.body ?? "");
  const titleSynced = useRef(note?.title);
  const bodySynced = useRef(note?.body);

  useEffect(() => {
    if (note?.title !== titleSynced.current) {
      titleSynced.current = note?.title;
      setTitle(note?.title ?? noteKindLabel(kind));
    }
    if (note?.body !== bodySynced.current) {
      bodySynced.current = note?.body;
      setBody(note?.body ?? "");
    }
  }, [kind, note?.body, note?.title]);

  const persist = useCallback(
    (patch: { title?: string; body?: string; kind?: CanvasNoteKind }) => {
      const project = useProjectStore.getState().projects[shape.props.projectId];
      if (!project || !shape.props.noteId) return;
      upsertProject(
        upsertCanvasNote(project, {
          id: shape.props.noteId,
          kind: patch.kind ?? kind,
          title: patch.title ?? title,
          body: patch.body ?? body,
        })
      );
    },
    [body, kind, shape.props.noteId, shape.props.projectId, title, upsertProject]
  );

  const remove = useCallback(() => {
    const project = useProjectStore.getState().projects[shape.props.projectId];
    if (project && shape.props.noteId) {
      upsertProject(deleteCanvasNote(project, shape.props.noteId));
    }
    editor.deleteShapes([shape.id]);
    editor.selectNone();
  }, [editor, shape.id, shape.props.noteId, shape.props.projectId, upsertProject]);

  const isEditing = useSyncExternalStore(
    subscribeTextNoteEditing,
    () => isTextNoteEditing(shape.props.noteId),
    () => false
  );
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isSelected) endTextNoteEdit(shape.props.noteId);
  }, [isSelected, shape.props.noteId]);

  useEffect(() => {
    if (!isEditing) return;
    bodyRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    if (shape.props.h >= 360) return;
    editor.updateShape({
      id: shape.id,
      type: "text-note",
      props: { h: TEXT_NOTE_DEFAULT_H },
    });
    const project = useProjectStore.getState().projects[shape.props.projectId];
    if (!project || !shape.props.noteId) return;
    upsertProject(
      upsertCanvasNote(project, {
        id: shape.props.noteId,
        h: TEXT_NOTE_DEFAULT_H,
      })
    );
  }, [editor, shape.id, shape.props.h, shape.props.noteId, shape.props.projectId, upsertProject]);

  const removeButton = isSelected ? (
    <button
      type="button"
      className="vad-text-note-remove"
      aria-label="删除卡片"
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        editor.markEventAsHandled(event);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        event.preventDefault();
        editor.markEventAsHandled(event);
        remove();
      }}
    >
      <Trash2 size={12} />
    </button>
  ) : null;

  const hold = (event: PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    editor.markEventAsHandled(event);
  };

  const runTry = (action: (typeof TRY_ACTIONS)[number]["id"]) => {
    const project = useProjectStore.getState().projects[shape.props.projectId];
    const sourcePrompt = note?.parentAssetId
      ? project?.assets?.find((asset) => asset.id === note.parentAssetId)?.prompt
      : undefined;
    persist({
      kind: action,
      title: title === noteKindLabel(kind) ? noteKindLabel(action) : title,
    });
    useCanvasUiStore.getState().offerComposerDraft(
      composerPromptForTextTask({
        task: action,
        noteId: shape.props.noteId,
        sourcePrompt,
      })
    );
  };

  return (
    <HTMLContainer
      id={shape.id}
      className={"vad-text-note" + (kind === "spec" ? " vad-text-note--spec" : "")}
      style={{
        width: shape.props.w,
        height: shape.props.h,
        boxSizing: "border-box",
        pointerEvents: "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        color: c.text,
      }}
    >
      <div className="vad-text-note-label">
        {kind === "spec" ? (
          <Palette size={14} strokeWidth={1.75} aria-hidden />
        ) : (
          <Text size={14} strokeWidth={1.75} aria-hidden />
        )}
        <span>{kind === "spec" ? "规格" : "文本"}</span>
        {kind === "spec" && note?.adopted ? <span>当前</span> : null}
        {removeButton}
      </div>
      {isEditing ? (
        <textarea
          ref={bodyRef}
          className="vad-text-note-body"
          value={body}
          placeholder={kind === "spec" ? "写下风格、色彩、材质、光…" : "写下内容…"}
          aria-label="正文"
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => setBody(event.target.value)}
          onBlur={() => persist({ body })}
        />
      ) : body.trim() ? (
        <p className="vad-text-note-read">{body}</p>
      ) : kind === "spec" ? (
        <div className="vad-text-note-try">
          <p>风格提示</p>
          <button
            type="button"
            className="vad-text-note-try-btn"
            onPointerDown={hold}
            onPointerUp={(event) => {
              hold(event);
              useCanvasUiStore.getState().offerComposerDraft(
                composerPromptForCite({
                  kind: "spec",
                  noteId: shape.props.noteId,
                })
              );
            }}
          >
            <Palette size={15} strokeWidth={1.75} aria-hidden />
            <span>
              <strong>让 Agent 写</strong>
              <em>色彩、材质、光</em>
            </span>
          </button>
        </div>
      ) : (
        <>
          <div className="vad-text-note-mark" aria-hidden>
            <span />
          </div>
          <div className="vad-text-note-try">
            <p>试试：</p>
            {TRY_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                className="vad-text-note-try-btn"
                onPointerDown={hold}
                onPointerUp={(event) => {
                  hold(event);
                  runTry(action.id);
                }}
              >
                <action.Icon size={15} strokeWidth={1.75} aria-hidden />
                <span>
                  <strong>{action.label}</strong>
                  <em>{action.hint}</em>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </HTMLContainer>
  );
}

export function makeTextNoteShape(input: {
  noteId: string;
  projectId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}) {
  return {
    id: createShapeId(`text-note:${input.noteId}`),
    type: "text-note" as const,
    x: input.x,
    y: input.y,
    props: {
      w: input.w ?? TEXT_NOTE_DEFAULT_W,
      h: input.h ?? TEXT_NOTE_DEFAULT_H,
      noteId: input.noteId,
      projectId: input.projectId,
    },
  };
}
