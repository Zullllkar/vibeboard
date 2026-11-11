import type { Editor } from "tldraw";

type Origin = {
  id: string;
  type: "image-asset" | "text-note";
  x: number;
  y: number;
};

const session: { leaderId: string | null; origins: Origin[]; applying: boolean } = {
  leaderId: null,
  origins: [],
  applying: false,
};

export function beginComparisonDrag(
  editor: Editor,
  leaderId: string,
  memberAssetIds: string[],
  memberNoteIds: string[]
) {
  const assets = new Set(memberAssetIds);
  const notes = new Set(memberNoteIds);
  const origins: Origin[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    const type = shape.type as string;
    if (type === "image-asset") {
      const id = (shape as unknown as { props: { assetId: string } }).props.assetId;
      if (!assets.has(id)) continue;
      origins.push({ id: shape.id, type: "image-asset", x: shape.x, y: shape.y });
    }
    if (type === "text-note") {
      const id = (shape as unknown as { props: { noteId: string } }).props.noteId;
      if (!notes.has(id)) continue;
      origins.push({ id: shape.id, type: "text-note", x: shape.x, y: shape.y });
    }
  }
  session.leaderId = leaderId;
  session.origins = origins;
}

export function applyComparisonDrag(
  editor: Editor,
  leaderId: string,
  dx: number,
  dy: number
) {
  if (session.applying || session.leaderId !== leaderId) return;
  const selected = new Set(editor.getSelectedShapeIds());
  const updates = session.origins
    .filter((origin) => !selected.has(origin.id))
    .map((origin) => ({
      id: origin.id,
      type: origin.type,
      x: origin.x + dx,
      y: origin.y + dy,
    }));
  if (updates.length === 0) return;
  session.applying = true;
  try {
    editor.updateShapes(updates as never);
  } finally {
    session.applying = false;
  }
}

export function endComparisonDrag(leaderId: string) {
  if (session.leaderId !== leaderId) return;
  session.leaderId = null;
  session.origins = [];
}
