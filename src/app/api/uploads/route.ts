/**
 * File Upload API
 * --------------------------------------------------------------
 * 接收 multipart 文件上传（图片等），保存到 .vad/projects/<id>/assets/。
 * 支持 png/jpeg/webp/gif/svg。
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import {
  isCanvasImageFile,
  titleFromUploadFileName,
} from "@/lib/project/canvas-image-upload";
import { storeUploadedCanvasImage } from "@/lib/vad/store-uploaded-asset";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "missing projectId" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }

  if (!isCanvasImageFile({ type: file.type, name: file.name })) {
    return NextResponse.json(
      { error: `unsupported file type: ${file.type || file.name}` },
      { status: 415 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `file too large: ${file.size} bytes (max ${MAX_FILE_SIZE})` },
      { status: 413 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const requestedId = formData.get("assetId");
    const assetId =
      typeof requestedId === "string" && requestedId.trim()
        ? requestedId.trim()
        : nanoid(12);
    const stored = await storeUploadedCanvasImage({
      projectId,
      assetId,
      fileName: file.name,
      mimeType: file.type,
      bytes: buffer,
      title: titleFromUploadFileName(file.name),
    });

    return NextResponse.json({
      id: assetId,
      filename: stored.filename,
      path: `assets/${stored.filename}`,
      mimeType: file.type || "image/png",
      size: buffer.length,
      url: stored.src,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `upload failed: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
