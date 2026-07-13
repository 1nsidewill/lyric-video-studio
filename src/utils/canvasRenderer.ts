import type { ProjectData } from '../types';
import { getSingerColor } from './singerColors';

export interface RenderState {
  smoothOffset: number;
  /** Time-based line-scroll transition state. Driven by `currentTime` so preview
   *  (rAF) and render (fixed-step) glide identically. */
  fromOffset: number;
  targetOffset: number;
  transitionStart: number; // seconds, in currentTime units
  /** Cached static layer: bg + album art + title — rendered once, reused every frame.
   *  Ensures pixel-identical background → H.264 sees zero false motion → no trembling. */
  staticLayer: HTMLCanvasElement | null;
}

export function createRenderState(): RenderState {
  return { smoothOffset: 0, fromOffset: 0, targetOffset: 0, transitionStart: -1, staticLayer: null };
}

/** Build the static (non-animated) portion of the frame once and cache it. */
function buildStaticLayer(
  artworkImg: HTMLImageElement | ImageBitmap,
  project: ProjectData,
  W: number,
  H: number,
  S: number,
): HTMLCanvasElement {
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  const c = bg.getContext('2d')!;

  // Blurred background
  c.filter = `blur(${25 * S}px) brightness(0.2)`;
  c.drawImage(artworkImg, -40 * S, -40 * S, W + 80 * S, H + 80 * S);
  c.filter = 'none';
  c.fillStyle = 'rgba(8, 8, 14, 0.55)';
  c.fillRect(0, 0, W, H);

  // Album art
  const leftW = W * 0.45;
  const artSize = Math.min(leftW - 60 * S, H * 0.6);
  const artX = (leftW - artSize) / 2;
  const artY = (H - artSize) / 2 - 35 * S;

  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 40 * S;
  c.shadowOffsetY = 10 * S;
  c.beginPath();
  c.roundRect(artX, artY, artSize, artSize, 18 * S);
  c.fillStyle = '#000';
  c.fill();
  c.restore();

  c.save();
  c.beginPath();
  c.roundRect(artX, artY, artSize, artSize, 18 * S);
  c.clip();
  c.drawImage(artworkImg, artX, artY, artSize, artSize);
  c.restore();

  // Title & artist
  c.textAlign = 'center';
  c.fillStyle = '#ffffff';
  c.font = `700 ${20 * S}px 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`;
  c.fillText(project.title || 'Untitled', leftW / 2, artY + artSize + 36 * S, leftW - 40 * S);
  c.fillStyle = 'rgba(180, 180, 200, 0.6)';
  c.font = `400 ${14 * S}px 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`;
  c.fillText(project.artist || '', leftW / 2, artY + artSize + 58 * S, leftW - 40 * S);

  // Divider
  c.strokeStyle = 'rgba(255,255,255,0.05)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(leftW, 50 * S);
  c.lineTo(leftW, H - 50 * S);
  c.stroke();

  return bg;
}

/**
 * Draw a single lyric video frame.
 * All dimensions scale proportionally to the canvas size relative to 1280x720 base.
 */
export function drawLyricFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  artworkImg: HTMLImageElement | ImageBitmap,
  project: ProjectData,
  currentTime: number,
  accentColor: [number, number, number],
  state: RenderState,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const S = W / 1280;
  const [ar, ag, ab] = accentColor;
  const lyrics = project.lyrics;

  // ── Static layer: render once, stamp every frame ──────────────────────────
  // Re-drawing blur+artwork every frame causes per-frame GPU timing variations.
  // Even 1-pixel difference in the background triggers H.264 inter-frame encoding
  // of the ENTIRE background, creating mosquito noise that looks like "trembling".
  if (!state.staticLayer) {
    state.staticLayer = buildStaticLayer(artworkImg, project, W, H, S);
  }
  ctx.drawImage(state.staticLayer, 0, 0);

  // Right: Lyrics
  const leftW = W * 0.45; // must match buildStaticLayer
  const rightX = leftW + 15 * S;
  const rightW = W - rightX - 25 * S;
  const rightCx = rightX + rightW / 2;
  let activeIdx = -1;
  let scrollIdx = 0;
  for (let i = 0; i < lyrics.length; i++) {
    const end = lyrics[i].end_time ?? (i + 1 < lyrics.length ? lyrics[i + 1].start_time : Infinity);
    if (currentTime >= lyrics[i].start_time && currentTime < end) { activeIdx = i; break; }
  }
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].start_time) { scrollIdx = i; break; }
  }

  // Time-based ease-out between lines: glides for TRANSITION_SEC, then rests exactly
  // on the target. Replaces the old per-frame exponential lerp (which crept toward the
  // target and snapped — reading as a shimmer/"tremble" as it settled). Because it is
  // driven by currentTime, the motion is identical in the live preview and the render.
  const target = activeIdx >= 0 ? activeIdx : scrollIdx;
  const TRANSITION_SEC = 0.34;
  if (target !== state.targetOffset) {
    // Adjacent lines glide; large jumps (e.g. a timeline seek) snap instantly.
    state.fromOffset = Math.abs(target - state.smoothOffset) > 2.5 ? target : state.smoothOffset;
    state.targetOffset = target;
    state.transitionStart = currentTime;
  }
  const t = Math.min(1, Math.max(0, (currentTime - state.transitionStart) / TRANSITION_SEC));
  const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic → smooth glide, crisp stop
  state.smoothOffset = state.fromOffset + (state.targetOffset - state.fromOffset) * eased;

  const lineH = 50 * S;
  const visible = 4;
  const centerY = H / 2;
  const scrollFrac = state.smoothOffset - Math.floor(state.smoothOffset);
  const CJK_NUDGE = 2 * S;

  // Static positions: round once (never change between frames)
  const rX = Math.round(rightX);
  const rW = Math.round(rightW);
  const rCx = Math.round(rightCx);
  const maxW = Math.round(rightW - 30 * S);
  const barFixedH = Math.round(lineH - 6 * S);

  for (let offset = -(visible + 1); offset <= visible + 1; offset++) {
    const idx = Math.floor(state.smoothOffset) + offset;
    if (idx < 0 || idx >= lyrics.length) continue;
    const isActive = idx === activeIdx;
    const visualOffset = offset - scrollFrac;
    // Keep y as float — canvas handles sub-pixel anti-aliasing correctly
    // Do NOT round here: rounding y causes 1-pixel oscillation ("trembling")
    const y = centerY + visualOffset * lineH - lineH / 2;
    if (y < 10 * S || y > H - 10 * S) continue;
    const line = lyrics[idx];

    const sClr = getSingerColor(line.singer);
    const barR = sClr ? sClr[0] : ar;
    const barG = sClr ? sClr[1] : ag;
    const barB = sClr ? sClr[2] : ab;

    if (isActive) {
      // y is float → smooth bar movement, no per-frame rounding jumps
      const barTop = y - 2 * S;
      ctx.fillStyle = `rgba(${barR}, ${barG}, ${barB}, 0.75)`;
      ctx.beginPath();
      ctx.roundRect(rX, barTop, rW, barFixedH, 6 * S);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${24 * S}px 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line.text, rCx, barTop + barFixedH / 2 + CJK_NUDGE, maxW);
      ctx.textBaseline = 'alphabetic';
    } else {
      const dist = Math.abs(visualOffset);
      const alpha = Math.max(0.06, 0.85 - dist * 0.18);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `400 ${18 * S}px 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`;
      ctx.fillStyle = `rgba(165, 165, 190, ${alpha})`;
      ctx.fillText(line.text, rCx, y + lineH / 2 + CJK_NUDGE, maxW);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Singer badge (static position — round is fine)
  const activeSinger = activeIdx >= 0 ? lyrics[activeIdx]?.singer : undefined;
  if (activeSinger) {
    const sClrBadge = getSingerColor(activeSinger);
    const bR = sClrBadge ? sClrBadge[0] : ar;
    const bG = sClrBadge ? sClrBadge[1] : ag;
    const bB = sClrBadge ? sClrBadge[2] : ab;
    ctx.font = `600 ${13 * S}px 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', monospace`;
    const metrics = ctx.measureText(activeSinger);
    const bw = Math.round(metrics.width + 24 * S);
    const bh = Math.round(28 * S);
    const bx = Math.round(W - bw - 18 * S);
    const by = Math.round(H - bh - 18 * S);
    ctx.fillStyle = `rgba(${bR}, ${bG}, ${bB}, 0.85)`;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6 * S);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(activeSinger, bx + bw / 2, by + bh / 2 + CJK_NUDGE);
    ctx.textBaseline = 'alphabetic';
  }
}
