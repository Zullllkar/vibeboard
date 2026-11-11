import { promises as fs } from "node:fs";
import {
  assetContentType,
  locateProjectAssetFile,
} from "@/lib/vad/stored-asset-path";

/**
 * 静态读取本地物理磁盘存储的图片资源
 * 路由：/api/assets/[projectId]/[subFolder]/[filename]
 * 例如：/api/assets/p12345/assets/image1.png
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length < 3) {
      return new Response("Not Found", { status: 404 });
    }

    const [projectId, subFolder, filename] = slug;
    
    // 安全校验：防止路径穿越攻击（只允许 assets 与 references 子目录，filename 限制为常规字符）
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
