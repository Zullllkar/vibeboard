import { nanoid } from "nanoid";
import type { ProjectFile } from "@/lib/project/schema";
import { adoptedProductionSkill } from "@/lib/targets/comparison-axis";

const ACCEPTANCE_GAP = 36;

export const WEBSITE_FRAME_W = 960;
export const WEBSITE_FRAME_H = 640;
export const WEBSITE_FRAME_PHONE_W = 390;
export const WEBSITE_FRAME_PHONE_H = 760;

export function normalizeWebsiteUrl(input: string): string | undefined {
  const raw = input.trim();
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username || url.password) return undefined;
  return url.toString();
}

export function addBlankWebsiteFrame(
  project: ProjectFile,
  input: { x: number; y: number }
): ProjectFile {
  return {
    ...project,
    websiteFrames: [
      ...(project.websiteFrames ?? []),
      {
        id: nanoid(10),
        url: "",
        x: input.x,
        y: input.y,
        w: WEBSITE_FRAME_W,
        h: WEBSITE_FRAME_H,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function addWebsiteFrame(
  project: ProjectFile,
  input: { url: string; x: number; y: number }
): ProjectFile | null {
  const url = normalizeWebsiteUrl(input.url);
  if (!url) return null;
  const frame = {
    id: nanoid(10),
    url,
    x: input.x,
    y: input.y,
    w: WEBSITE_FRAME_W,
    h: WEBSITE_FRAME_H,
  };
  return {
    ...project,
    websiteFrames: [...(project.websiteFrames ?? []), frame],
    updatedAt: new Date().toISOString(),
  };
}

export function updateWebsiteFrame(
  project: ProjectFile,
  frameId: string,
  patch: { url?: string; w?: number; h?: number }
): ProjectFile {
  const frames = project.websiteFrames ?? [];
  return {
    ...project,
    websiteFrames: frames.map((frame) => {
      if (frame.id !== frameId) return frame;
      const nextUrl = patch.url === undefined ? frame.url : normalizeWebsiteUrl(patch.url);
      return {
        ...frame,
        url: nextUrl ?? frame.url,
        w: patch.w ?? frame.w,
        h: patch.h ?? frame.h,
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 界面视觉已经点过「用这个」，并且实现页有真实地址时，把这一页放在选定稿旁边。
 * 不新造地址，也不改当前风格。
 */
export function attachAcceptanceFrame(
  project: ProjectFile,
  input: {
    assetId: string;
    url: string;
    beside?: { x: number; y: number; w: number; h: number };
  }
): ProjectFile {
  if (project.targetId !== "ui-visual") return project;
  if (project.designDirection?.styleSourceAssetId !== input.assetId) return project;
  const url = normalizeWebsiteUrl(input.url);
  if (!url) return project;
  const frames = project.websiteFrames ?? [];
  const existing = frames.find(
    (frame) => frame.purpose === "acceptance" && frame.acceptanceAssetId === input.assetId
  );
  if (existing?.url === url) return project;
  if (existing) {
    return {
      ...project,
      websiteFrames: frames.map((frame) => (frame.id === existing.id ? { ...frame, url } : frame)),
      updatedAt: new Date().toISOString(),
    };
  }
  const x = input.beside ? input.beside.x + input.beside.w + ACCEPTANCE_GAP : 0;
  const y = input.beside?.y ?? 0;
  return {
    ...project,
    websiteFrames: [
      ...frames,
      {
        id: nanoid(10),
        url,
        purpose: "acceptance" as const,
        acceptanceAssetId: input.assetId,
        x,
        y,
        w: WEBSITE_FRAME_W,
        h: WEBSITE_FRAME_H,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function websiteSpecDraft(url: string): string {
  return `按这个网站的截图写一张规格卡，只描述这一页。地址：${url}`;
}

/** 截图已经落在素材库之后，把这页收成参考图，并放一张还没采用的规格卡。 */
export function useThisWebsite(project: ProjectFile, frameId: string): ProjectFile | null {
  const frame = (project.websiteFrames ?? []).find((item) => item.id === frameId);
  if (!frame?.url || !frame.shotAssetId || frame.purpose === "acceptance") return null;
  const shotId = frame.shotAssetId;
  const skillId = adoptedProductionSkill(project.targetId);
  const hasSpec = (project.canvasNotes ?? []).some(
    (note) => note.kind === "spec" && note.parentAssetId === shotId
  );
  const now = new Date().toISOString();
  return {
    ...project,
    skillId: skillId ?? project.skillId,
    designSystemId: skillId ? undefined : project.designSystemId,
    designDirection: {
      summary: project.designDirection?.summary ?? "以这个网站的截图为参考",
      moodKeywords: project.designDirection?.moodKeywords ?? ["website"],
      typographyNotes: project.designDirection?.typographyNotes,
      layoutNotes: project.designDirection?.layoutNotes,
      recommendedDesignSystemId: project.designDirection?.recommendedDesignSystemId,
      styleSourceAssetId: shotId,
    },
    canvasNotes: hasSpec
      ? project.canvasNotes
      : [
          ...(project.canvasNotes ?? []),
          {
            id: nanoid(10),
            kind: "spec" as const,
            title: "规格",
            body: "",
            parentAssetId: shotId,
            createdAt: now,
            updatedAt: now,
          },
        ],
    updatedAt: now,
  };
}

export function attachWebsiteShot(
  project: ProjectFile,
  frameId: string,
  assetId: string
): ProjectFile {
  return {
    ...project,
    websiteFrames: (project.websiteFrames ?? []).map((frame) =>
      frame.id === frameId ? { ...frame, shotAssetId: assetId } : frame
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function deleteWebsiteFrame(project: ProjectFile, frameId: string): ProjectFile {
  return {
    ...project,
    websiteFrames: (project.websiteFrames ?? []).filter((frame) => frame.id !== frameId),
    updatedAt: new Date().toISOString(),
  };
}

export function persistWebsiteFrameLayout(
  frames: ProjectFile["websiteFrames"],
  shapes: Array<{
    type: string;
    x: number;
    y: number;
    props: { frameId?: string; w?: number; h?: number };
  }>
): ProjectFile["websiteFrames"] {
  if (!frames?.length) return frames;
  const byId = new Map(
    shapes
      .filter((shape) => shape.type === "website-frame" && shape.props.frameId)
      .map((shape) => [shape.props.frameId!, shape])
  );
  return frames.flatMap((frame) => {
    const shape = byId.get(frame.id);
    if (!shape) return [frame];
    return [
      {
        ...frame,
        x: shape.x,
        y: shape.y,
        w: shape.props.w ?? frame.w,
        h: shape.props.h ?? frame.h,
      },
    ];
  });
}
