#!/usr/bin/env python3
"""Generates the launcher icon and splash screen for the packaged TV clients.

The store containers want plain PNGs at fixed sizes (webOS: 400x400 icon and a
1920x1080 splash; Tizen reuses both). Keeping the generator in the repo means the
assets can be regenerated instead of being opaque binaries nobody can edit.

Usage: python3 scripts/gen-tv-assets.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

BACKGROUND = (10, 10, 10)
BRAND = (229, 9, 20)
# Dev builds get an amber mark so the two apps are impossible to confuse on the
# TV home screen.
BRAND_DEV = (245, 158, 11)
WHITE = (255, 255, 255)

OUT_DIR = Path(__file__).resolve().parent.parent / "tv" / "assets"


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def play_triangle(draw, center, size, fill):
    cx, cy = center
    half = size / 2
    # Nudged right so the triangle looks centered rather than measuring centered.
    draw.polygon(
        [
            (cx - half * 0.55, cy - half),
            (cx - half * 0.55, cy + half),
            (cx + half * 0.85, cy),
        ],
        fill=fill,
    )


def build_icon(size=400, brand=BRAND):
    image = Image.new("RGB", (size, size), BACKGROUND)
    draw = ImageDraw.Draw(image)

    margin = size * 0.12
    rounded_rect(draw, (margin, margin, size - margin, size - margin), size * 0.14, brand)
    play_triangle(draw, (size / 2, size / 2), size * 0.34, WHITE)

    return image


def build_splash(width=1920, height=1080):
    image = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(image)

    badge = 260
    left = (width - badge) / 2
    top = (height - badge) / 2 - 40

    rounded_rect(draw, (left, top, left + badge, top + badge), badge * 0.14, BRAND)
    play_triangle(draw, (left + badge / 2, top + badge / 2), badge * 0.34, WHITE)

    # A thin brand rule under the badge stands in for a wordmark, which would need
    # a bundled font to render identically across machines.
    rule_width = 420
    rule_y = top + badge + 90
    draw.rounded_rectangle(
        ((width - rule_width) / 2, rule_y, (width + rule_width) / 2, rule_y + 8),
        radius=4,
        fill=BRAND,
    )

    return image


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    build_icon().save(OUT_DIR / "icon.png")
    build_icon(80).save(OUT_DIR / "icon-small.png")
    build_splash().save(OUT_DIR / "splash.png")

    build_icon(brand=BRAND_DEV).save(OUT_DIR / "icon-dev.png")
    build_icon(80, brand=BRAND_DEV).save(OUT_DIR / "icon-small-dev.png")

    print(f"wrote assets to {OUT_DIR}")


if __name__ == "__main__":
    main()
