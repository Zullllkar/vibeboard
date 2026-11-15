#!/usr/bin/env python3
"""Build the visual assets used by README.md / README.zh.md.

Usage (from anywhere):
    python scripts/build-readme-assets.py

What it produces, inside .github/assets/:
    banner-en.png / banner-zh.png   localized hero banners
    hero-light.png, canvas-dark.png, agent-team.png,
    wireframe-vs-final.png, handoff-package.png,
    canvas-surfaces.png, banner-blueprint.png   selected UI previews
    demo.gif        UI tour (cross-fade between real screenshots)
    pipeline.gif    7-agent pipeline animation

Source screenshots live in the repository root. Re-run this script after
replacing any of them. Requires Pillow; ffmpeg is optional (falls back to
Pillow's GIF writer when it is unavailable).
"""

from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / ".github" / "assets"

BG = "#0E0F14"
PANEL = "#171923"
BORDER = "#2A2D3A"
INDIGO = "#6366F1"
INDIGO_STRONG = "#4F52E0"
WHITE = "#F5F6FA"
MUTED = "#9CA3AF"
DIM = "#6B7180"

FONTS = Path("C:/Windows/Fonts")
FONT_ZH = FONTS / "msyh.ttc"
FONT_ZH_BOLD = FONTS / "msyhbd.ttc"
FONT_EN = FONTS / "segoeui.ttf"
FONT_EN_BOLD = FONTS / "segoeuib.ttf"


def font(size: int, *, bold: bool = False, chinese: bool = False) -> ImageFont.FreeTypeFont:
    if chinese:
        path = FONT_ZH_BOLD if bold else FONT_ZH
    else:
        path = FONT_EN_BOLD if bold else FONT_EN
    return ImageFont.truetype(str(path if path.exists() else FONTS / "arial.ttf"), size)


def spaced_text(draw: ImageDraw.ImageDraw, xy, text: str, fnt, fill, spacing: int = 2) -> None:
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=fnt, fill=fill)
        x += draw.textlength(char, font=fnt) + spacing


def dotted_grid(draw: ImageDraw.ImageDraw, width: int, height: int, step: int = 24, color="#1B1E28") -> None:
    for y in range(step // 2, height, step):
        for x in range(step // 2, width, step):
            draw.ellipse((x, y, x + 1.5, y + 1.5), fill=color)


# --------------------------------------------------------------------------
# 1. Copy the selected screenshots into .github/assets/
# --------------------------------------------------------------------------
SCREENSHOTS = {
    "sh-light.png": "hero-light.png",
    "at-0.png": "canvas-dark.png",
    "tt-roles.png": "agent-team.png",
    "cmpa.png": "wireframe-vs-final.png",
    "tt-v3.png": "handoff-package.png",
    "sh-s1.png": "canvas-surfaces.png",
    "vibeboard-og-blueprint.png": "banner-blueprint.png",
    "vibeboard-og-light.png": "banner-light-og.png",
}


def copy_screenshots() -> None:
    for src, dst in SCREENSHOTS.items():
        source = ROOT / src
        if not source.exists():
            print(f"  ! missing source screenshot: {src}")
            continue
        target = ASSETS / dst
        shutil.copyfile(source, target)
        print(f"  {dst:<28} {target.stat().st_size / 1024:>7.0f} KB")


# --------------------------------------------------------------------------
# 2. Localized hero banners
# --------------------------------------------------------------------------
BANNER_COPY = {
    "en": {
        "eyebrow": "LOCAL-FIRST  /  OPEN SOURCE",
        "line1": "From a brief to",
        "line2": "design assets your agent can ship.",
        "sub": "7 AI agents  ·  infinite canvas  ·  one handoff package for Cursor / Claude Code / Codex",
        "zh": False,
    },
    "zh": {
        "eyebrow": "本地优先  /  开源",
        "line1": "把想法变成",
        "line2": "Agent 能落地的成品设计。",
        "sub": "7 个 AI Agent · 无限画布 · 一键交付给 Cursor / Claude Code / Codex 的设计上下文",
        "zh": True,
    },
}


def draw_logo(draw: ImageDraw.ImageDraw, x: int, y: int, size: int = 34) -> None:
    draw.rounded_rectangle((x, y, x + size, y + size), radius=9, fill=INDIGO)
    cx = x + size / 2
    draw.line(
        [(cx - 8, y + 12), (cx, y + 23), (cx + 8, y + 12)],
        fill="#FFFFFF",
        width=3,
        joint="curve",
    )
    for px, py in ((x + 3, y + 3), (x + size - 5, y + 3), (x + 3, y + size - 5), (x + size - 5, y + size - 5)):
        draw.ellipse((px, py, px + 2.5, py + 2.5), fill="#C7D2FE")


def draw_canvas_ornament(img: Image.Image) -> None:
    """Small stylized 'canvas with floating assets' on the right of the banner."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = 936, 92, 1152, 292
    d.rounded_rectangle((x0, y0, x1, y1), radius=16, fill=(23, 25, 35, 235), outline=(58, 61, 78, 255), width=1)
    # dotted canvas background
    for yy in range(y0 + 12, y1 - 8, 18):
        for xx in range(x0 + 12, x1 - 8, 18):
            d.ellipse((xx, yy, xx + 1.2, yy + 1.2), fill=(90, 94, 115, 90))
    # dotted connector
    for i in range(10):
        xx = x0 + 28 + i * 12
        d.line((xx, y0 + 130, xx + 6, y0 + 130), fill=(129, 140, 248, 150), width=2)
    # white asset card
    d.rounded_rectangle((x0 + 18, y0 + 24, x0 + 128, y0 + 100), radius=8, fill=(248, 249, 252, 255))
    d.rounded_rectangle((x0 + 30, y0 + 38, x0 + 92, y0 + 44), radius=3, fill=(203, 207, 216, 255))
    d.rounded_rectangle((x0 + 30, y0 + 52, x0 + 112, y0 + 58), radius=3, fill=(222, 225, 232, 255))
    d.rounded_rectangle((x0 + 30, y0 + 66, x0 + 82, y0 + 72), radius=3, fill=(222, 225, 232, 255))
    d.rounded_rectangle((x0 + 30, y0 + 82, x0 + 60, y0 + 92), radius=3, fill=(99, 102, 241, 255))
    # indigo asset card
    d.rounded_rectangle((x0 + 110, y0 + 112, x1 - 14, y1 - 24), radius=8, fill=(79, 82, 224, 255))
    d.rounded_rectangle((x0 + 124, y0 + 128, x1 - 32, y0 + 134), radius=3, fill=(199, 210, 254, 255))
    d.rounded_rectangle((x0 + 124, y0 + 142, x0 + 178, y0 + 148), radius=3, fill=(165, 180, 252, 255))
    d.rounded_rectangle((x0 + 124, y0 + 160, x1 - 34, y1 - 38), radius=4, fill=(99, 102, 241, 255))
    # sticky note
    d.rounded_rectangle((x0 + 22, y0 + 116, x0 + 96, y1 - 18), radius=6, fill=(240, 240, 235, 255))
    d.rounded_rectangle((x0 + 32, y0 + 128, x0 + 80, y0 + 133), radius=2, fill=(150, 152, 160, 255))
    d.rounded_rectangle((x0 + 32, y0 + 140, x0 + 86, y0 + 145), radius=2, fill=(150, 152, 160, 255))
    img.alpha_composite(layer)


def build_banner(lang: str) -> None:
    copy = BANNER_COPY[lang]
    w, h = 1200, 340
    img = Image.new("RGBA", (w, h), BG)
    d = ImageDraw.Draw(img)
    dotted_grid(d, w, h, step=26, color="#1C1F29")

    draw_logo(d, 72, 42)
    d.text((118, 45), "Vibeboard", font=font(25, bold=True), fill=WHITE)
    eyebrow_font = font(11, bold=True, chinese=copy["zh"])
    eyebrow_w = sum(d.textlength(c, font=eyebrow_font) + 3 for c in copy["eyebrow"])
    spaced_text(d, (w - 72 - eyebrow_w, 54), copy["eyebrow"], eyebrow_font, DIM, spacing=3)

    title_font = font(46 if copy["zh"] else 47, bold=True, chinese=copy["zh"])
    d.text((72, 116), copy["line1"], font=title_font, fill=WHITE)
    d.text((72, 178), copy["line2"], font=title_font, fill=WHITE)
    d.text((72, 258), copy["sub"], font=font(15, chinese=copy["zh"]), fill=MUTED)

    # accent underline under the title
    d.rounded_rectangle((72, 244, 148, 247), radius=2, fill=INDIGO)
    draw_canvas_ornament(img)

    # gradient rule at the bottom
    for x in range(w):
        strength = math.sin(math.pi * x / w) ** 2
        alpha = int(150 * strength)
        d.line((x, h - 3, x, h - 1), fill=(99, 102, 241, alpha))

    out = ASSETS / f"banner-{lang}.png"
    img.convert("RGB").save(out, optimize=True)
    print(f"  banner-{lang}.png{'':<17} {out.stat().st_size / 1024:>7.0f} KB")


# --------------------------------------------------------------------------
# 3. GIF utilities
# --------------------------------------------------------------------------
def frames_to_gif(frames: list[Image.Image], out: Path, fps: int = 8) -> None:
    """Use ffmpeg's palettegen/paletteuse for smaller, cleaner GIFs."""
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        for i, frame in enumerate(frames):
            frame.convert("RGB").save(tmpdir / f"{i:04d}.png")
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg:
            cmd = [
                ffmpeg, "-y", "-loglevel", "error",
                "-framerate", str(fps), "-i", str(tmpdir / "%04d.png"),
                "-vf", "split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
                "-loop", "0", str(out),
            ]
            if subprocess.run(cmd).returncode == 0:
                return
            print("  ! ffmpeg failed, falling back to Pillow GIF writer")
    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        duration=int(1000 / fps),
        loop=0,
        optimize=True,
    )


def cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Center-crop-resize into an exact size."""
    tw, th = size
    ratio = max(tw / img.width, th / img.height)
    resized = img.resize((round(img.width * ratio), round(img.height * ratio)), Image.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


DEMO_SCENES = [
    ("hero-light.png", "01  Infinite Canvas / 无限画布"),
    ("banner-light-og.png", "02  Brief → Finished Assets / 一句话到成品图"),
    ("canvas-dark.png", "03  Dark Workspace / 深色工作台"),
    ("wireframe-vs-final.png", "04  Wireframe → Final Asset / 线框到成品"),
    ("banner-blueprint.png", "05  Agents at Work / Agent 开始干活"),
    ("handoff-package.png", "06  Handoff Package / 交接包"),
]


def demo_scene_frame(path: Path, caption: str) -> Image.Image:
    w, h = 960, 600
    base = cover(Image.open(path).convert("RGB"), (w, h))
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.rectangle((0, h - 54, w, h), fill=(12, 13, 18, 255))
    d.line((0, h - 54, w, h - 54), fill=(99, 102, 241, 190), width=1)
    cap_font = font(19, bold=True, chinese=True)
    d.text((26, h - 43), caption, font=cap_font, fill=WHITE)
    brand_font = font(12, bold=True)
    bw = d.textlength("VIBEBOARD", font=brand_font)
    d.text((w - 26 - bw, h - 39), "VIBEBOARD", font=brand_font, fill="#818CF8")
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def build_demo_gif() -> None:
    hold, fade, fps = 11, 3, 8
    scenes = []
    for name, caption in DEMO_SCENES:
        path = ASSETS / name
        if not path.exists():
            print(f"  ! skipping demo scene (missing): {name}")
            continue
        scenes.append(demo_scene_frame(path, caption))
    if not scenes:
        return
    frames: list[Image.Image] = []
    for i, scene in enumerate(scenes):
        frames.extend([scene] * hold)
        nxt = scenes[(i + 1) % len(scenes)]
        for step in range(1, fade + 1):
            frames.append(Image.blend(scene, nxt, step / (fade + 1)))
    out = ASSETS / "demo.gif"
    frames_to_gif(frames, out, fps)
    print(f"  demo.gif{'':<25} {out.stat().st_size / 1024:>7.0f} KB  ({len(frames)} frames)")


AGENTS = [
    "Architect",
    "Design Director",
    "Layout Engineer",
    "Content Writer",
    "Image Planner",
    "Image Executor",
    "Critic & Repair",
    "Handoff Package",
]


def pipeline_frame(active: int) -> Image.Image:
    w, h = 960, 300
    img = Image.new("RGBA", (w, h), BG)
    d = ImageDraw.Draw(img)
    dotted_grid(d, w, h, step=22, color="#191C25")

    label_font = font(11, bold=True)
    spaced_text(d, (40, 26), "VIBEBOARD  /  PIPELINE", label_font, "#818CF8", spacing=2)
    right = "ONE BRIEF IN  ·  FINISHED ASSETS OUT"
    rw = sum(d.textlength(c, font=label_font) + 2 for c in right)
    spaced_text(d, (w - 40 - rw, 26), right, label_font, DIM, spacing=2)
    d.text((40, 52), "Seven agents, one canvas, one handoff.", font=font(19, bold=True), fill=WHITE)

    cw, ch, gx, gy = 205, 62, 16, 14
    x0, y0 = 40, 100
    for i, name in enumerate(AGENTS):
        col, row = i % 4, i // 4
        x = x0 + col * (cw + gx)
        y = y0 + row * (ch + gy)
        is_last = i == len(AGENTS) - 1
        on = i <= active
        if is_last and on:
            fill, outline = INDIGO_STRONG, INDIGO
            num_color, name_color = "#C7D2FE", "#FFFFFF"
        elif on:
            fill, outline = "#1C1F31", INDIGO
            num_color, name_color = "#A5B4FC", WHITE
        else:
            fill, outline = "#14161D", "#282B36"
            num_color, name_color = "#4B5060", "#767C8C"
        d.rounded_rectangle((x, y, x + cw, y + ch), radius=10, fill=fill, outline=outline, width=1)
        d.text((x + 14, y + 13), f"{i + 1:02d}", font=font(15, bold=True), fill=num_color)
        d.text((x + 48, y + 21), name, font=font(14, bold=on), fill=name_color)

    status_y = 258
    if active < 7:
        status = f"RUNNING  {active + 1:02d}/08    {AGENTS[active]}"
        status_color = "#A5B4FC"
    else:
        status = "handoff/  →  PNG + prompts + tokens.json  →  Cursor / Claude Code / Codex"
        status_color = "#C7D2FE"
    d.rounded_rectangle((40, status_y - 8, w - 40, status_y + 24), radius=8, fill="#151720", outline="#252835")
    d.text((54, status_y), status, font=font(14, bold=True), fill=status_color)
    return img


def build_pipeline_gif() -> None:
    frames: list[Image.Image] = []
    for active in range(len(AGENTS)):
        frames.extend([pipeline_frame(active)] * 3)
    frames.extend([pipeline_frame(len(AGENTS) - 1)] * 14)
    out = ASSETS / "pipeline.gif"
    frames_to_gif(frames, out, fps=8)
    print(f"  pipeline.gif{'':<21} {out.stat().st_size / 1024:>7.0f} KB  ({len(frames)} frames)")


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    print("Copying UI previews -> .github/assets/")
    copy_screenshots()
    print("Building localized banners")
    build_banner("en")
    build_banner("zh")
    print("Building GIFs")
    build_demo_gif()
    build_pipeline_gif()
    print(f"\nDone. Assets in {ASSETS}")


if __name__ == "__main__":
    main()
