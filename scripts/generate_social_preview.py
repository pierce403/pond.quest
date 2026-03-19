#!/usr/bin/env python3

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
IMAGE_DIR = PUBLIC_DIR / "assets" / "images"
OG_PATH = PUBLIC_DIR / "og-image.png"
EMBED_PATH = PUBLIC_DIR / "embed-image.png"
WIDTH = 1200
HEIGHT = 630


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf") if bold else Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") if bold else Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def hex_color(value: int, alpha: int = 255) -> tuple[int, int, int, int]:
    return ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF, alpha)


def iso_to_screen(iso_x: float, iso_y: float, origin_x: float, origin_y: float, half_w: float, half_h: float) -> tuple[float, float]:
    return (
        origin_x + (iso_x - iso_y) * half_w,
        origin_y + (iso_x + iso_y) * half_h,
    )


def rounded_panel(base: Image.Image, box: tuple[int, int, int, int], radius: int, fill: tuple[int, int, int, int], outline: tuple[int, int, int, int]) -> None:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2)
    base.alpha_composite(overlay)


def draw_meadow(base: Image.Image, rng: random.Random) -> None:
    draw = ImageDraw.Draw(base)

    top = hex_color(0x5F9A45)
    bottom = hex_color(0x2E5F2D)
    for y in range(HEIGHT):
        blend = y / max(1, HEIGHT - 1)
        row = (
            int(top[0] + (bottom[0] - top[0]) * blend),
            int(top[1] + (bottom[1] - top[1]) * blend),
            int(top[2] + (bottom[2] - top[2]) * blend),
            255,
        )
        draw.line((0, y, WIDTH, y), fill=row)

    for _ in range(150):
        x = rng.randint(-40, WIDTH + 40)
        y = rng.randint(-20, HEIGHT + 20)
        rx = rng.randint(28, 110)
        ry = rng.randint(10, 34)
        tint = hex_color(rng.choice([0x6AA04B, 0x4E7F39, 0x7DBF60]), rng.randint(20, 70))
        draw.ellipse((x - rx, y - ry, x + rx, y + ry), fill=tint)


def draw_pond(base: Image.Image) -> None:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    origin_x = 810
    origin_y = 120
    half_w = 90
    half_h = 46
    grid_w = 4
    grid_h = 4

    outer = [
        iso_to_screen(-0.55, -0.55, origin_x, origin_y, half_w, half_h),
        iso_to_screen(grid_w - 0.45, -0.55, origin_x, origin_y, half_w, half_h),
        iso_to_screen(grid_w - 0.45, grid_h - 0.45, origin_x, origin_y, half_w, half_h),
        iso_to_screen(-0.55, grid_h - 0.45, origin_x, origin_y, half_w, half_h),
    ]
    inner = [
        iso_to_screen(-0.35, -0.35, origin_x, origin_y, half_w, half_h),
        iso_to_screen(grid_w - 0.65, -0.35, origin_x, origin_y, half_w, half_h),
        iso_to_screen(grid_w - 0.65, grid_h - 0.65, origin_x, origin_y, half_w, half_h),
        iso_to_screen(-0.35, grid_h - 0.65, origin_x, origin_y, half_w, half_h),
    ]
    draw.polygon(outer, fill=hex_color(0x6B705C, 204))
    draw.polygon(inner, fill=hex_color(0x497C5A, 180))

    water_deep = hex_color(0x2D6A4F, 245)
    water_mid = hex_color(0x52B788, 160)
    water_light = hex_color(0xA7D8B5, 70)

    for tile_y in range(grid_h):
        for tile_x in range(grid_w):
            cx, cy = iso_to_screen(tile_x, tile_y, origin_x, origin_y, half_w, half_h)
            diamond = [
                (cx, cy - half_h),
                (cx + half_w, cy),
                (cx, cy + half_h),
                (cx - half_w, cy),
            ]
            inner_diamond = [
                (cx, cy - half_h + 5),
                (cx + half_w - 5, cy),
                (cx, cy + half_h - 4),
                (cx - half_w + 5, cy),
            ]
            draw.polygon(diamond, fill=water_deep, outline=hex_color(0x1D4C38, 180))
            draw.polygon(inner_diamond, fill=water_mid)
            draw.line((diamond[0], diamond[1]), fill=water_light, width=2)
            draw.line((diamond[0], diamond[3]), fill=water_light, width=2)

    shimmer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shimmer_draw = ImageDraw.Draw(shimmer)
    for center, size in [((710, 186), (94, 34)), ((880, 286), (112, 38)), ((960, 220), (72, 24)), ((802, 382), (84, 28))]:
        x, y = center
        rx, ry = size
        shimmer_draw.ellipse((x - rx, y - ry, x + rx, y + ry), fill=hex_color(0xD9F5E2, 52))
    shimmer = shimmer.filter(ImageFilter.GaussianBlur(10))

    reeds = Image.new("RGBA", base.size, (0, 0, 0, 0))
    reeds_draw = ImageDraw.Draw(reeds)
    for base_x, base_y in [(955, 190), (1010, 330), (610, 220)]:
        for idx in range(5):
            x = base_x + idx * 16
            reeds_draw.line((x, base_y + 34, x + 2, base_y), fill=hex_color(0x83B24A, 210), width=4)
            reeds_draw.ellipse((x - 4, base_y - 14, x + 8, base_y + 8), fill=hex_color(0xA56D3E, 220))

    pads = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pads_draw = ImageDraw.Draw(pads)
    for x, y, w, h, tint in [(780, 320, 54, 26, 0x2D6A4F), (930, 260, 48, 22, 0x40916C), (720, 248, 38, 18, 0x52B788)]:
        pads_draw.ellipse((x - w, y - h, x + w, y + h), fill=hex_color(tint, 180))

    base.alpha_composite(shimmer)
    base.alpha_composite(reeds)
    base.alpha_composite(pads)
    base.alpha_composite(overlay)


def paste_fish(base: Image.Image, path: Path, center: tuple[int, int], width: int, shadow_offset: tuple[int, int] = (14, 16)) -> None:
    fish = Image.open(path).convert("RGBA")
    ratio = width / fish.width
    fish = fish.resize((width, int(fish.height * ratio)), Image.Resampling.LANCZOS)

    shadow = fish.copy()
    alpha = shadow.getchannel("A")
    shadow = Image.new("RGBA", fish.size, (0, 0, 0, 0))
    shadow.putalpha(alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))

    fish_x = int(center[0] - fish.width / 2)
    fish_y = int(center[1] - fish.height / 2)
    shadow_x = fish_x + shadow_offset[0]
    shadow_y = fish_y + shadow_offset[1]

    base.alpha_composite(shadow, (shadow_x, shadow_y))
    base.alpha_composite(fish, (fish_x, fish_y))


def draw_copy(base: Image.Image) -> None:
    serif_bold = load_font(74, bold=True)
    serif_regular = load_font(28)
    sans_bold = load_font(24, bold=True)
    sans_regular = load_font(22)

    rounded_panel(
        base,
        box=(68, 64, 570, 566),
        radius=28,
        fill=(7, 18, 12, 170),
        outline=(125, 198, 132, 110),
    )

    draw = ImageDraw.Draw(base)
    badge_box = (96, 96, 336, 142)
    draw.rounded_rectangle(badge_box, radius=20, fill=(90, 170, 110, 64), outline=(146, 214, 160, 140), width=2)
    draw.text((118, 108), "Farcaster Mini App", font=sans_bold, fill=(220, 247, 228, 255))

    draw.text((96, 178), "Pond Quest", font=serif_bold, fill=(244, 250, 240, 255))
    draw.text((100, 264), "Build a calm pond,\nraise bright fish,\nand balance the water.", font=serif_regular, fill=(211, 235, 214, 255), spacing=8)

    details = [
        ("Fish", "click to place and poke"),
        ("Plants", "grow, age, and filter"),
        ("Water", "real chemistry under the hood"),
    ]
    y = 392
    for label, text in details:
        draw.rounded_rectangle((98, y, 540, y + 42), radius=16, fill=(255, 255, 255, 18))
        draw.text((116, y + 8), label, font=sans_bold, fill=(171, 230, 184, 255))
        draw.text((206, y + 8), text, font=sans_regular, fill=(230, 241, 232, 245))
        y += 54

    draw.text((98, 536), "pond.quest", font=sans_bold, fill=(245, 222, 129, 255))


def add_vignette(base: Image.Image) -> None:
    mask = Image.new("L", base.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((-180, -120, WIDTH + 180, HEIGHT + 120), fill=220)
    mask = mask.filter(ImageFilter.GaussianBlur(120))
    vignette = Image.new("RGBA", base.size, (4, 10, 8, 0))
    vignette.putalpha(Image.eval(mask, lambda px: 255 - px))
    base.alpha_composite(vignette)


def build_preview() -> Image.Image:
    rng = random.Random(403)
    base = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    draw_meadow(base, rng)
    draw_pond(base)

    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((716, 126, 1120, 516), fill=(96, 190, 170, 42))
    glow_draw.ellipse((668, 88, 1080, 470), fill=(180, 224, 192, 24))
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(48)))

    paste_fish(base, IMAGE_DIR / "fish_koi_se.png", center=(1020, 330), width=250)
    paste_fish(base, IMAGE_DIR / "fish_goldfish_se.png", center=(640, 236), width=150, shadow_offset=(10, 12))
    paste_fish(base, IMAGE_DIR / "fish_shubunkin_se.png", center=(770, 412), width=134, shadow_offset=(8, 10))

    draw_copy(base)
    add_vignette(base)
    return base


def main() -> None:
    preview = build_preview()
    OG_PATH.parent.mkdir(parents=True, exist_ok=True)
    preview.save(OG_PATH)
    preview.save(EMBED_PATH)
    print(f"wrote {OG_PATH.relative_to(ROOT)}")
    print(f"wrote {EMBED_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
