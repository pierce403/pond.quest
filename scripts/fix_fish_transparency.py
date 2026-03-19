#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path

try:
    from rembg import new_session, remove
except ImportError as exc:  # pragma: no cover - operator guidance
    raise SystemExit(
        "Missing Python dependency: rembg. Create a venv and install "
        "`rembg onnxruntime`, then rerun this script."
    ) from exc


ALPHA_MATTING_FOREGROUND_THRESHOLD = 240
ALPHA_MATTING_BACKGROUND_THRESHOLD = 15
ALPHA_MATTING_ERODE_SIZE = 8


def process_image(session, source: Path, destination: Path) -> None:
    destination.write_bytes(
        remove(
            source.read_bytes(),
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=ALPHA_MATTING_FOREGROUND_THRESHOLD,
            alpha_matting_background_threshold=ALPHA_MATTING_BACKGROUND_THRESHOLD,
            alpha_matting_erode_size=ALPHA_MATTING_ERODE_SIZE,
            post_process_mask=True,
        )
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Remove baked checkerboard backgrounds from Pond Quest fish sprites."
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("public/assets/images"),
        help="Directory containing fish_*.png sprites.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directory to write cleaned sprites to. Defaults to --source-dir.",
    )
    parser.add_argument(
        "--model",
        default="u2net",
        help="rembg session model to use.",
    )
    parser.add_argument(
        "--sync-root-assets",
        action="store_true",
        help="Also copy cleaned base fish PNGs into assets/images/ for source parity.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    source_dir = args.source_dir.resolve()
    output_dir = (args.output_dir or args.source_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    sources = sorted(source_dir.glob("fish_*.png"))
    if not sources:
        parser.error(f"No fish_*.png files found in {source_dir}")

    session = new_session(args.model)
    for source in sources:
        destination = output_dir / source.name
        process_image(session, source, destination)
        print(f"cleaned {destination}")

    if args.sync_root_assets:
        root_dir = Path("assets/images").resolve()
        root_dir.mkdir(parents=True, exist_ok=True)
        for name in ("fish_goldfish.png", "fish_koi.png", "fish_shubunkin.png"):
            target = root_dir / name
            target.write_bytes((output_dir / name).read_bytes())
            print(f"synced {target}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
