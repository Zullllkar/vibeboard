import { promises as fs } from "node:fs";
import {
  assetContentType,
  locateProjectAssetFile,
} from "@/lib/vad/stored-asset-path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; subFolder: string; filename: string }> }
) {
  try {
    const { projectId, subFolder, filename } = await params;
    if (subFolder !== "assets" && subFolder !== "references") {
      return new Response("Forbidden", { status: 403 });
    }

    const filePath = await locateProjectAssetFile(projectId, subFolder, filename);
    if (!filePath) return new Response("Not Found", { status: 404 });
    const buffer = await fs.readFile(filePath);
    return new Response(buffer, {
      headers: {
        "Content-Type": assetContentType(filename),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
