import { captureViaDesktop } from "@/lib/bridge/capture-agent";
import { normalizeWebsiteUrl } from "@/lib/canvas/website-frame";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown; width?: unknown } | null;
  const url = normalizeWebsiteUrl(typeof body?.url === "string" ? body.url : "");
  if (!url) {
    return Response.json({ ok: false, error: "地址无效" }, { status: 400 });
  }
  const width = typeof body?.width === "number" ? body.width : undefined;
  const shot = await captureViaDesktop({ url, width, fullPage: true });
  if (!shot.ok) {
    return Response.json(
      { ok: false, error: shot.code === "no_agent" ? "桌面端不在，没法截整页" : shot.error },
      { status: 503 }
    );
  }
  return Response.json({
    ok: true,
    dataUrl: shot.dataUrl,
    width: shot.width,
    height: shot.height,
  });
}
