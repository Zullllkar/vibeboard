"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import { createShapeId, type RecordProps, type TLBaseShape } from "@/lib/tldraw-compat";
import { Globe, Monitor, Smartphone, Trash2 } from "lucide-react";
import { HTMLContainer, Rectangle2d, ShapeUtil, T } from "tldraw";
import { useCanvasChromePalette } from "@/lib/canvas/use-canvas-chrome";
import {
  WEBSITE_FRAME_H,
  WEBSITE_FRAME_PHONE_H,
  WEBSITE_FRAME_PHONE_W,
  WEBSITE_FRAME_W,
  attachWebsiteShot,
  deleteWebsiteFrame,
  normalizeWebsiteUrl,
  updateWebsiteFrame,
  useThisWebsite,
  websiteSpecDraft,
} from "@/lib/canvas/website-frame";
import {
  applyUploadedImageToProject,
  buildUploadedImageAsset,
  uploadDroppedCanvasImage,
} from "@/lib/project/canvas-image-upload";
import { useCanvasUiStore } from "@/store/canvas-ui-store";
import { useProjectStore } from "@/store/project-store";

const CARD_RADIUS = 18;

const iconButton = {
  pointerEvents: "auto" as const,
  display: "grid",
  placeItems: "center",
  width: 24,
  height: 24,
  padding: 0,
  border: 0,
  background: "transparent",
  color: "inherit",
};

export type WebsiteFrameShape = TLBaseShape<
  "website-frame",
  {
    w: number;
    h: number;
    frameId: string;
    projectId: string;
  }
>;

export class WebsiteFrameShapeUtil extends ShapeUtil<WebsiteFrameShape> {
  static override type = "website-frame" as const;

  static override props: RecordProps<WebsiteFrameShape> = {
    w: T.number,
    h: T.number,
    frameId: T.string,
    projectId: T.string,
  };

  getDefaultProps(): WebsiteFrameShape["props"] {
    return {
      w: WEBSITE_FRAME_W,
      h: WEBSITE_FRAME_H,
      frameId: "",
      projectId: "",
    };
  }

  override canEdit() {
    return false;
  }

  override canResize() {
    return false;
  }

  getGeometry(shape: WebsiteFrameShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  indicator(shape: WebsiteFrameShape) {
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

  component(shape: WebsiteFrameShape) {
    return <WebsiteFrameView shape={shape} />;
  }
}

function WebsiteFrameView({ shape }: { shape: WebsiteFrameShape }) {
  const c = useCanvasChromePalette();
  const upsertProject = useProjectStore((s) => s.upsert);
  const frame = useProjectStore((s) =>
    (s.projects[shape.props.projectId]?.websiteFrames ?? []).find(
      (item) => item.id === shape.props.frameId
    )
  );
  const [draft, setDraft] = useState(frame?.url ?? "");
  const [captureError, setCaptureError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const pageUrl = frame?.url ? normalizeWebsiteUrl(frame.url) : undefined;
  const shot = useProjectStore((s) =>
    frame?.shotAssetId
      ? (s.projects[shape.props.projectId]?.assets ?? []).find((asset) => asset.id === frame.shotAssetId)
      : undefined
  );
  const phone = (frame?.w ?? shape.props.w) <= WEBSITE_FRAME_PHONE_W + 8;

  const commitUrl = () => {
    const project = useProjectStore.getState().projects[shape.props.projectId];
    if (!project) return;
    const next = normalizeWebsiteUrl(draft);
    if (!next) {
      setDraft(frame?.url ?? "");
      return;
    }
    upsertProject(updateWebsiteFrame(project, shape.props.frameId, { url: next }));
  };

  const setViewport = (next: "desktop" | "phone") => {
    const project = useProjectStore.getState().projects[shape.props.projectId];
    if (!project) return;
    const w = next === "phone" ? WEBSITE_FRAME_PHONE_W : WEBSITE_FRAME_W;
    const h = next === "phone" ? WEBSITE_FRAME_PHONE_H : WEBSITE_FRAME_H;
    upsertProject(updateWebsiteFrame(project, shape.props.frameId, { w, h }));
  };

  const remove = () => {
    const project = useProjectStore.getState().projects[shape.props.projectId];
    if (!project) return;
    upsertProject(deleteWebsiteFrame(project, shape.props.frameId));
  };

  const capturePage = async () => {
    const project = useProjectStore.getState().projects[shape.props.projectId];
    if (!project || !pageUrl || capturing) return;
    setCapturing(true);
    setCaptureError("");
    try {
      const res = await fetch("/api/desktop-capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: pageUrl, width: frame?.w ?? shape.props.w }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        dataUrl?: string;
        width?: number;
        height?: number;
      };
      if (!res.ok || !data.ok || !data.dataUrl) {
        setCaptureError(data.error || "没法截整页");
        return;
      }
      const blob = await (await fetch(data.dataUrl)).blob();
      const assetId = nanoid(10);
      const file = new File([blob], "website.png", { type: blob.type || "image/png" });
      const src = await uploadDroppedCanvasImage(project.id, assetId, file);
      const asset = buildUploadedImageAsset({
        id: assetId,
        fileName: "网站截图",
        src,
        width: data.width ?? frame?.w ?? shape.props.w,
        height: data.height ?? frame?.h ?? shape.props.h,
      });
      upsertProject(attachWebsiteShot(applyUploadedImageToProject(project, asset), shape.props.frameId, assetId));
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "没法截整页");
    } finally {
      setCapturing(false);
    }
  };

  const useSite = () => {
    const project = useProjectStore.getState().projects[shape.props.projectId];
    if (!project || !pageUrl) return;
    const next = useThisWebsite(project, shape.props.frameId);
    if (!next) return;
    upsertProject(next);
    useCanvasUiStore.getState().offerComposerDraft(websiteSpecDraft(pageUrl));
  };

  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: shape.props.w,
        height: shape.props.h,
        boxSizing: "border-box",
        pointerEvents: "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        borderRadius: CARD_RADIUS,
        background: c.surface,
        color: c.text,
        boxShadow: c.cardShadow,
        border: `1px solid ${c.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <Globe size={14} strokeWidth={1.75} aria-hidden />
        <span style={{ fontSize: 12 }}>{frame?.purpose === "acceptance" ? "验收" : "网站"}</span>
        <input
          value={draft}
          placeholder="粘贴网址"
          aria-label="网站地址"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitUrl}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            pointerEvents: "auto",
            flex: 1,
            minWidth: 0,
            border: 0,
            background: "transparent",
            color: c.text,
            fontSize: 12,
            outline: "none",
          }}
        />
        <button
          type="button"
          aria-label="桌面宽度"
          aria-pressed={!phone}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setViewport("desktop")}
          style={iconButton}
        >
          <Monitor size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="手机宽度"
          aria-pressed={phone}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setViewport("phone")}
          style={iconButton}
        >
          <Smartphone size={14} strokeWidth={1.75} />
        </button>
        {pageUrl ? (
          <button
            type="button"
            aria-label="截整页"
            disabled={capturing}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => void capturePage()}
            style={{ ...iconButton, width: "auto", padding: "0 6px", fontSize: 12 }}
          >
            {capturing ? "截取中" : "截整页"}
          </button>
        ) : null}
        {frame?.shotAssetId && frame.purpose !== "acceptance" ? (
          <button
            type="button"
            aria-label="用这个网站"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={useSite}
            style={{ ...iconButton, width: "auto", padding: "0 6px", fontSize: 12 }}
          >
            用这个网站
          </button>
        ) : null}
        <button
          type="button"
          aria-label="删除网站卡"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={remove}
          style={iconButton}
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      </div>
      {shot?.src ? (
        <img
          alt="网站整页"
          src={shot.src}
          style={{ flex: 1, width: "100%", objectFit: "contain", background: c.surface }}
        />
      ) : pageUrl ? (
        <iframe
          title={pageUrl}
          src={pageUrl}
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          style={{
            pointerEvents: "auto",
            flex: 1,
            width: "100%",
            border: 0,
            background: c.surface,
          }}
        />
      ) : (
        <p style={{ margin: 16, fontSize: 13, color: c.textMuted }}>
          粘贴一个网址。能打开就直接显示。
        </p>
      )}
      {captureError ? (
        <p style={{ margin: "0 12px 8px", fontSize: 12, color: c.textMuted }}>{captureError}</p>
      ) : null}
    </HTMLContainer>
  );
}

export function makeWebsiteFrameShape(input: {
  frameId: string;
  projectId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}) {
  return {
    id: createShapeId(`website-frame:${input.frameId}`),
    type: "website-frame" as const,
    x: input.x,
    y: input.y,
    props: {
      w: input.w ?? WEBSITE_FRAME_W,
      h: input.h ?? WEBSITE_FRAME_H,
      frameId: input.frameId,
      projectId: input.projectId,
    },
  };
}
