"""
Lyric video generator — Pixel-matched to Preview canvas (1280x720 → 1920x1080 = 1.5x)
Background: blurred art + dark overlay (no translucent art)
Audio: copy codec (lossless passthrough) for mp3/m4a/flac, or high-quality AAC fallback
"""
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.config import settings
from app.models.schemas import LyricLine

FONT_PATHS = {
    "regular": "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "bold": "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "fallback": "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
}

S = 1.5  # scale from preview 1280x720 to render 1920x1080


def _font(style: str = "regular", size: int = 32) -> ImageFont.FreeTypeFont:
    path = FONT_PATHS.get(style, FONT_PATHS["regular"])
    if Path(path).exists():
        return ImageFont.truetype(path, size)
    fb = FONT_PATHS["fallback"]
    if Path(fb).exists():
        return ImageFont.truetype(fb, size)
    return ImageFont.load_default()


def _dominant_color(img: Image.Image) -> tuple[int, int, int]:
    small = img.resize((80, 80), Image.LANCZOS).convert("RGB")
    pixels = list(small.getdata())
    bucketed = [((r >> 3) << 3, (g >> 3) << 3, (b >> 3) << 3) for r, g, b in pixels]
    vivid = [c for c in bucketed if max(c) > 60 and (max(c) - min(c)) > 30]
    if not vivid:
        vivid = bucketed
    counter = Counter(vivid)
    dominant = counter.most_common(1)[0][0]
    return tuple(min(255, int(c * 1.3)) for c in dominant)


def _round_rect_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size[0], size[1]], radius=radius, fill=255)
    return mask


_SINGER_PALETTE = [
    (220, 130, 70), (100, 180, 255), (230, 100, 160), (120, 220, 160),
    (180, 130, 255), (255, 200, 80), (100, 220, 220), (255, 130, 130),
    (160, 200, 100), (200, 160, 220),
]


def _parse_singer_tags(lyrics: list[LyricLine]) -> list[LyricLine]:
    has_singer = any(l.singer for l in lyrics)
    if has_singer:
        return lyrics
    result: list[LyricLine] = []
    current_singer: str | None = None
    idx = 0
    for line in lyrics:
        m = re.match(r'^\[(.+)\]$', line.text.strip())
        if m:
            current_singer = m.group(1).strip()
            continue
        result.append(LyricLine(
            index=idx, text=line.text, start_time=line.start_time,
            end_time=line.end_time, singer=current_singer,
        ))
        idx += 1
    return result


def _build_singer_color_map(lyrics: list[LyricLine]) -> dict[str, tuple[int, int, int]]:
    mapping: dict[str, tuple[int, int, int]] = {}
    idx = 0
    for line in lyrics:
        if line.singer and line.singer.lower().strip() not in mapping:
            mapping[line.singer.lower().strip()] = _SINGER_PALETTE[idx % len(_SINGER_PALETTE)]
            idx += 1
    return mapping


def _render_frame(
    bg: Image.Image,
    art_thumb: Image.Image,
    art_mask: Image.Image,
    lyrics: list[LyricLine],
    current_time: float,
    width: int,
    height: int,
    accent: tuple[int, int, int],
    title: str,
    artist: str,
    singer_colors: dict[str, tuple[int, int, int]] | None = None,
    smooth_offset: float = 0.0,
) -> tuple[Image.Image, float]:
    frame = bg.copy().convert("RGBA")
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    ar, ag, ab = accent

    # === LEFT: Album art (matched to preview 0.45) ===
    left_w = int(width * 0.45)
    art_size = art_thumb.size[0]
    art_x = (left_w - art_size) // 2
    art_y = (height - art_size) // 2 - int(35 * S)

    shadow = Image.new("RGBA", (art_size + 24, art_size + 24), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [0, 0, art_size + 24, art_size + 24], radius=int(18 * S), fill=(0, 0, 0, 128)
    )
    frame.paste(shadow, (art_x - 12, art_y + int(10 * S)), shadow)
    frame.paste(art_thumb, (art_x, art_y), art_mask)

    # Title + artist (preview: bold 20px / 14px)
    font_title = _font("bold", int(20 * S))
    font_artist = _font("regular", int(14 * S))
    info_cx = left_w // 2
    draw.text((info_cx, art_y + art_size + int(36 * S)), title or "Untitled",
              font=font_title, fill=(255, 255, 255, 255), anchor="mt")
    draw.text((info_cx, art_y + art_size + int(58 * S)), artist or "",
              font=font_artist, fill=(180, 180, 200, 153), anchor="mt")

    # Divider
    draw.line([(left_w, int(50 * S)), (left_w, height - int(50 * S))],
              fill=(255, 255, 255, 13), width=1)

    # === RIGHT: Lyrics (matched to preview) ===
    right_x = left_w + int(15 * S)
    right_w = width - right_x - int(25 * S)
    right_cx = right_x + right_w // 2

    active_idx = -1
    scroll_idx = 0
    for i, line in enumerate(lyrics):
        end = line.end_time if line.end_time else (
            lyrics[i + 1].start_time if i + 1 < len(lyrics) else float("inf"))
        if line.start_time <= current_time < end:
            active_idx = i
            break
    for i in range(len(lyrics) - 1, -1, -1):
        if lyrics[i].start_time <= current_time:
            scroll_idx = i
            break

    target_offset = active_idx if active_idx >= 0 else scroll_idx
    # Same lerp as preview: 0.08 at 60fps → identical motion
    smooth_offset += (target_offset - smooth_offset) * 0.08

    line_h = int(50 * S)
    font_active = _font("bold", int(24 * S))
    font_inactive = _font("regular", int(18 * S))
    visible = 4
    center_y = height // 2
    cjk_nudge = int(2 * S)

    scroll_frac = smooth_offset - int(smooth_offset)

    for vis_offset in range(-(visible + 1), visible + 2):
        idx = int(smooth_offset) + vis_offset
        if idx < 0 or idx >= len(lyrics):
            continue

        is_active = idx == active_idx
        visual_offset = vis_offset - scroll_frac
        y = center_y + visual_offset * line_h - line_h // 2
        if y < int(10 * S) or y > height - int(10 * S):
            continue

        text = lyrics[idx].text
        singer = lyrics[idx].singer
        s_clr = (singer_colors or {}).get((singer or "").lower().strip(), accent)
        s_r, s_g, s_b = s_clr

        if is_active:
            bar_top = int(y - 2 * S)
            bar_bot = int(y + line_h - 6 * S)
            draw.rounded_rectangle(
                [right_x, bar_top, right_x + right_w, bar_bot],
                radius=int(6 * S),
                fill=(s_r, s_g, s_b, 191),
            )
            bar_cy = (bar_top + bar_bot) // 2 + cjk_nudge
            draw.text((right_cx, bar_cy), text, font=font_active,
                       fill=(255, 255, 255, 255), anchor="mm")
        else:
            dist = abs(visual_offset)
            alpha_f = max(0.06, 0.85 - dist * 0.18)
            alpha = int(alpha_f * 255)
            line_cy = int(y + line_h / 2) + cjk_nudge
            draw.text((right_cx, line_cy), text, font=font_inactive,
                       fill=(165, 165, 190, alpha), anchor="mm")

    # Singer badge (preview: bold 13px, 28px height, bottom-right)
    active_singer = lyrics[active_idx].singer if 0 <= active_idx < len(lyrics) else None
    if active_singer:
        s_clr = (singer_colors or {}).get(active_singer.lower().strip(), accent)
        font_badge = _font("bold", int(13 * S))
        badge_bbox = draw.textbbox((0, 0), active_singer, font=font_badge)
        bw = badge_bbox[2] - badge_bbox[0] + int(24 * S)
        bh = int(28 * S)
        bx = width - bw - int(18 * S)
        by = height - bh - int(18 * S)
        draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=int(6 * S),
                                fill=(s_clr[0], s_clr[1], s_clr[2], 217))
        badge_cy = by + bh // 2 + cjk_nudge
        draw.text((bx + bw // 2, badge_cy), active_singer, font=font_badge,
                   fill=(255, 255, 255, 255), anchor="mm")

    frame = Image.alpha_composite(frame, overlay)
    return frame.convert("RGB"), smooth_offset


def generate_lyric_video(
    project_id: str,
    width: int = 1920,
    height: int = 1080,
    fps: int = 60,
    on_progress: callable = None,
) -> Path:
    project_dir = settings.upload_path / project_id
    meta_file = project_dir / "project.json"
    if not meta_file.exists():
        raise FileNotFoundError("Project metadata not found")

    data = json.loads(meta_file.read_text())
    lyrics = [l for l in _parse_singer_tags([LyricLine(**l) for l in data["lyrics"]]) if l.start_time > 0]
    title = data.get("title", "")
    artist = data.get("artist", "")
    singer_colors = _build_singer_color_map(lyrics)

    audio_dir = project_dir / "audio"
    audio_file = next(audio_dir.iterdir())
    art_dir = project_dir / "artwork"
    art_file = next(art_dir.iterdir())

    art_orig = Image.open(art_file).convert("RGB")
    accent = _dominant_color(art_orig)

    # Art thumbnail (matched to preview: leftW*0.45, artSize = min(leftW-60, H*0.6) scaled)
    left_w = int(width * 0.45)
    art_size = min(left_w - int(60 * S), int(height * 0.6))
    art_thumb = art_orig.resize((art_size, art_size), Image.LANCZOS)
    art_mask = _round_rect_mask((art_size, art_size), radius=int(18 * S))

    # Background: blur + dark overlay (matched to preview)
    bg_base = art_orig.resize((width + int(80 * S), height + int(80 * S)), Image.LANCZOS)
    bg_base = bg_base.filter(ImageFilter.GaussianBlur(radius=int(25 * S)))
    bg_crop = bg_base.crop((int(40 * S), int(40 * S), int(40 * S) + width, int(40 * S) + height))
    from PIL import ImageEnhance
    bg_crop = ImageEnhance.Brightness(bg_crop).enhance(0.2)
    dark_overlay = Image.new("RGBA", (width, height), (8, 8, 14, 140))
    bg = Image.alpha_composite(bg_crop.convert("RGBA"), dark_overlay).convert("RGB")

    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", str(audio_file)],
        capture_output=True, text=True,
    )
    duration = float(probe.stdout.strip())
    total_frames = int(duration * fps)

    output_dir = settings.output_path
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"{project_id}.mp4"

    # Always transcode to high-quality AAC for maximum MP4 compatibility
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-s", f"{width}x{height}", "-pix_fmt", "rgb24",
        "-r", str(fps), "-i", "pipe:0",
        "-i", str(audio_file),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
        "-pix_fmt", "yuv420p", "-shortest",
        str(output_file),
    ]

    proc = subprocess.Popen(
        ffmpeg_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )

    smooth_offset = 0.0
    try:
        for frame_num in range(total_frames):
            t = frame_num / fps
            frame, smooth_offset = _render_frame(
                bg, art_thumb, art_mask, lyrics, t, width, height,
                accent, title, artist, singer_colors, smooth_offset,
            )
            proc.stdin.write(frame.tobytes())
            if on_progress and frame_num % (fps * 2) == 0:
                on_progress(frame_num / total_frames)
        proc.stdin.close()
    except BrokenPipeError:
        pass

    stderr_output = proc.stderr.read().decode() if proc.stderr else ""
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg failed (code {proc.returncode}): {stderr_output[-2000:]}")
    if on_progress:
        on_progress(1.0)
    return output_file
