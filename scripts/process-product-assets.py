"""Remove studio backgrounds from generated catalogue product photos."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw


def process(source: Path, target: Path) -> None:
    image = Image.open(source).convert("RGBA")
    marker = (255, 0, 255, 0)
    for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)):
        if image.getpixel(point)[3] != 0:
            ImageDraw.floodfill(image, point, marker, thresh=28)

    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise ValueError(f"No foreground detected in {source}")

    foreground = image.crop(bounds)
    margin = round(max(foreground.size) * 0.09)
    canvas_size = max(foreground.width, foreground.height) + margin * 2
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    foreground.thumbnail((canvas_size - margin * 2, canvas_size - margin * 2), Image.Resampling.LANCZOS)
    canvas.alpha_composite(foreground, ((canvas_size - foreground.width) // 2, (canvas_size - foreground.height) // 2))
    canvas = canvas.resize((800, 800), Image.Resampling.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, optimize=True)
    print(f"{source.name} -> {target} ({target.stat().st_size:,} bytes)")


if len(sys.argv) < 3 or len(sys.argv[1:]) % 2:
    raise SystemExit("Usage: process-product-assets.py <source> <target> [<source> <target> ...]")

for source_arg, target_arg in zip(sys.argv[1::2], sys.argv[2::2]):
    process(Path(source_arg), Path(target_arg))
