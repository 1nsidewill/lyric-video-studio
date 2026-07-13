import type { ProjectData } from '../types';
import { getSingerColor } from './singerColors';

export interface FrameExtras {
  /** Raw EQ band levels (0..1) at the current time, or null. Length = spectrogram bands. */
  bands?: Float32Array | null;
  showEq?: boolean;
  showTimeline?: boolean;
  /** Track duration in seconds (for the timeline). */
  duration?: number;
}

export interface RenderState {
  smoothOffset: number;
  fromOffset: number;
  targetOffset: number;
  transitionStart: number; // seconds
  eqLevels: Float32Array | null;
  staticLayer: HTMLCanvasElement | null;
  /** Key the cached static layer was built with — rebuild when dims / EQ toggle change. */
  staticKey: string | null;
}

export function createRenderState(): RenderState {
  return {
    smoothOffset: 0,
    fromOffset: 0,
    targetOffset: 0,
    transitionStart: -1,
    eqLevels: null,
    staticLayer: null,
    staticKey: null,
  };
}

const FONT = "'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const BASE = [8, 9, 14] as const;

interface Layout {
  portrait: boolean;
  artX: number; artY: number; artSize: number;
  eqX: number; eqTop: number; eqW: number; eqH: number;
  tlX: number; tlY: number; tlW: number;
  // lyrics region
  lyrColX: number; lyrColW: number; lyrCx: number; lyrCenterY: number; lyrTop: number;
  lineH: number; barH: number; activeFont: number; inactiveFont: number; lyrMaxW: number;
  // landscape text block (title/artist/album under the art)
  textCx: number; titleY: number; artistY: number; albumY: number; dividerX: number;
}

function computeLayout(W: number, H: number, S: number, portrait: boolean, showEq: boolean, hasAlbum: boolean, showTimeline: boolean): Layout {
  if (portrait) {
    const artSize = W * 0.72;
    const artX = (W - artSize) / 2;
    const artY = 130 * S;
    const eqH = showEq ? 44 * S : 0;
    const eqTop = artY + artSize;
    const tlW = W * 0.6;
    const tlY = eqTop + eqH + 42 * S;
    // Lyrics fill the space below whatever is shown; when EQ / timeline are toggled off
    // that space grows and the lyrics rise to fill it.
    const contentBottom = showTimeline ? tlY + 14 * S : eqTop + eqH;
    const lyrTop = contentBottom + 28 * S;
    const lyrAreaBottom = H - 44 * S;
    const lyrColW = W * 0.86;
    return {
      portrait: true,
      artX, artY, artSize,
      eqX: artX, eqTop, eqW: artSize, eqH,
      tlX: (W - tlW) / 2, tlY, tlW,
      lyrColX: (W - lyrColW) / 2, lyrColW, lyrCx: W / 2,
      lyrCenterY: (lyrTop + lyrAreaBottom) / 2, lyrTop,
      lineH: 58 * S, barH: 52 * S, activeFont: 32 * S, inactiveFont: 22 * S, lyrMaxW: lyrColW - 24 * S,
      textCx: 0, titleY: 0, artistY: 0, albumY: 0, dividerX: 0,
    };
  }
  // Landscape
  const leftW = W * 0.45;
  const artSize = Math.min(leftW - 64 * S, H * 0.5);
  const artX = (leftW - artSize) / 2;
  const eqH = showEq ? 46 * S : 0;
  const albumH = hasAlbum ? 18 * S : 0;
  const blockH = artSize + eqH + 34 * S + 20 * S + albumH;
  const artY = Math.max(24 * S, (H - blockH) / 2);
  const eqTop = artY + artSize;
  const titleY = eqTop + eqH + 30 * S;
  const rightX = leftW + 15 * S;
  const rightW = W - rightX - 25 * S;
  const tlW = W / 3;
  return {
    portrait: false,
    artX, artY, artSize,
    eqX: artX, eqTop, eqW: artSize, eqH,
    tlX: (W - tlW) / 2, tlY: H - 48 * S, tlW,
    lyrColX: rightX, lyrColW: rightW, lyrCx: rightX + rightW / 2, lyrCenterY: H / 2, lyrTop: 10 * S,
    lineH: 50 * S, barH: 44 * S, activeFont: 24 * S, inactiveFont: 18 * S, lyrMaxW: rightW - 30 * S,
    textCx: leftW / 2, titleY, artistY: titleY + 22 * S, albumY: titleY + 40 * S, dividerX: leftW,
  };
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function coverDraw(
  c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: HTMLImageElement | ImageBitmap,
  x: number, y: number, size: number,
) {
  const iw = (img as { width: number }).width || size;
  const ih = (img as { height: number }).height || size;
  const side = Math.min(iw, ih);
  c.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, x, y, size, size);
}

/** Build the static (non-animated) portion of the frame once and cache it. */
function buildStaticLayer(
  artworkImg: HTMLImageElement | ImageBitmap,
  project: ProjectData,
  W: number, H: number, S: number,
  L: Layout,
  accent: [number, number, number],
): HTMLCanvasElement {
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  const c = bg.getContext('2d')!;
  const album = project.album?.trim();

  // Ambient background from the album's dominant color (not the photo, not a flat block).
  const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const tint = (t: number) => `rgb(${mix(BASE[0], accent[0], t)}, ${mix(BASE[1], accent[1], t)}, ${mix(BASE[2], accent[2], t)})`;
  const lg = c.createLinearGradient(0, 0, W, H);
  lg.addColorStop(0, tint(0.26));
  lg.addColorStop(0.55, tint(0.1));
  lg.addColorStop(1, `rgb(${BASE[0]}, ${BASE[1]}, ${BASE[2]})`);
  c.fillStyle = lg;
  c.fillRect(0, 0, W, H);
  const gx = L.artX + L.artSize * 0.5;
  const gy = L.artY + L.artSize * 0.42;
  const rg = c.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.6);
  rg.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.16)`);
  rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.fillStyle = rg;
  c.fillRect(0, 0, W, H);

  // Album art (square corners, shadow, cover-fit)
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 40 * S;
  c.shadowOffsetY = 8 * S;
  c.beginPath();
  c.rect(L.artX, L.artY, L.artSize, L.artSize);
  c.fillStyle = '#000';
  c.fill();
  c.restore();

  c.save();
  c.beginPath();
  c.rect(L.artX, L.artY, L.artSize, L.artSize);
  c.clip();
  coverDraw(c, artworkImg, L.artX, L.artY, L.artSize);
  c.restore();

  // Dissolve the art's bottom gradually so the EQ waves rise out of the image instead of
  // cutting across it — softer + taller than a hard dark band, and it stops short of black.
  const fadeH = L.artSize * 0.4;
  const fadeTop = L.artY + L.artSize - fadeH;
  const fadeGrad = c.createLinearGradient(0, fadeTop, 0, L.artY + L.artSize);
  fadeGrad.addColorStop(0, 'rgba(8,8,14,0)');
  fadeGrad.addColorStop(0.6, 'rgba(8,8,14,0.32)');
  fadeGrad.addColorStop(1, 'rgba(8,8,14,0.8)');
  c.fillStyle = fadeGrad;
  c.fillRect(L.artX, fadeTop, L.artSize, fadeH + 2 * S);

  if (L.portrait) {
    // Title / artist as a glass badge overlapping the art's bottom-left.
    const subtitle = album ? `${project.artist || ''} · ${album}` : (project.artist || '');
    const titleF = 26 * S;
    const subF = 15 * S;
    const padX = 16 * S;
    const padY = 13 * S;
    c.font = `700 ${titleF}px ${FONT}`;
    const tw = c.measureText(project.title || 'Untitled').width;
    c.font = `500 ${subF}px ${FONT}`;
    const sw = subtitle ? c.measureText(subtitle).width : 0;
    const bw = Math.min(L.artSize - 36 * S, Math.max(tw, sw) + padX * 2);
    const bh = padY * 2 + titleF + (subtitle ? subF + 8 * S : 0);
    const bx = L.artX + 18 * S;
    const by = L.artY + L.artSize - bh - 18 * S;
    c.fillStyle = 'rgba(10,10,16,0.38)';
    c.beginPath();
    c.roundRect(bx, by, bw, bh, 14 * S);
    c.fill();
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffffff';
    c.font = `700 ${titleF}px ${FONT}`;
    c.fillText(project.title || 'Untitled', bx + padX, by + padY + titleF * 0.82, bw - padX * 2);
    if (subtitle) {
      c.fillStyle = 'rgba(225,225,235,0.72)';
      c.font = `500 ${subF}px ${FONT}`;
      c.fillText(subtitle, bx + padX, by + padY + titleF + 8 * S + subF * 0.8, bw - padX * 2);
    }
  } else {
    // Landscape: title / artist / album text block under the EQ.
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffffff';
    c.font = `700 ${20 * S}px ${FONT}`;
    c.fillText(project.title || 'Untitled', L.textCx, L.titleY, L.artSize + 40 * S);
    c.fillStyle = 'rgba(180, 180, 200, 0.6)';
    c.font = `400 ${14 * S}px ${FONT}`;
    c.fillText(project.artist || '', L.textCx, L.artistY, L.artSize + 40 * S);
    if (album) {
      c.fillStyle = 'rgba(170, 170, 190, 0.42)';
      c.font = `400 ${12 * S}px ${FONT}`;
      c.fillText(album, L.textCx, L.albumY, L.artSize + 40 * S);
    }
    // Divider
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(L.dividerX, 50 * S);
    c.lineTo(L.dividerX, H - 50 * S);
    c.stroke();
  }

  return bg;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Auto-pick a vivid EQ color from the album's dominant color: same hue as the ambient
 *  background so the scene stays cohesive, but saturated + bright enough to read against
 *  the dark backdrop and the photo. Near-neutral albums fall back to a clean light tint. */
function toEqColor(accent: [number, number, number]): [number, number, number] {
  const r = accent[0] / 255, g = accent[1] / 255, bl = accent[2] / 255;
  const max = Math.max(r, g, bl), min = Math.min(r, g, bl), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.12) return [232, 235, 242];
  let h = 0;
  if (max === r) h = ((g - bl) / d) % 6;
  else if (max === g) h = (bl - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return hslToRgb(h / 360, Math.min(0.85, Math.max(0.5, s * 1.4)), 0.62);
}

/** Reactive EQ as a filled form dissolving down from the album art's bottom edge. */
function drawEqForm(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  L: Layout, S: number, bands: Float32Array, state: RenderState,
  color: [number, number, number],
) {
  const n = bands.length;
  if (n < 2) return;
  if (!state.eqLevels || state.eqLevels.length !== n) state.eqLevels = new Float32Array(n);
  const lv = state.eqLevels;
  for (let b = 0; b < n; b++) lv[b] += (bands[b] - lv[b]) * (bands[b] > lv[b] ? 0.55 : 0.16);

  const overlap = 26 * S;
  const top = L.eqTop - overlap;
  const maxDepth = L.eqH + overlap;
  const step = L.eqW / (n - 1);
  const depth = (b: number) => L.eqTop + Math.max(1.5 * S, lv[b] * L.eqH);
  const [cr, cg, cb] = color;

  // Fade in from fully transparent deep inside the image, peak just below the art edge,
  // ease off at the wave tips — the form emerges from the photo with no hard seam.
  const grad = ctx.createLinearGradient(0, top, 0, top + maxDepth);
  grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
  grad.addColorStop((overlap / maxDepth) * 0.7, `rgba(${cr},${cg},${cb},0.05)`);
  grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.5)`);
  grad.addColorStop(1, `rgba(${cr},${cg},${cb},0.14)`);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(L.eqX, top);
  ctx.lineTo(L.eqX, depth(0));
  for (let b = 0; b < n - 1; b++) {
    const x1 = L.eqX + b * step;
    const x2 = L.eqX + (b + 1) * step;
    ctx.quadraticCurveTo(x1, depth(b), (x1 + x2) / 2, (depth(b) + depth(b + 1)) / 2);
  }
  ctx.lineTo(L.eqX + L.eqW, depth(n - 1));
  ctx.lineTo(L.eqX + L.eqW, top);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTimeline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number, y: number, w: number, S: number, currentTime: number, duration: number,
) {
  const trackH = Math.max(3, Math.round(3 * S));
  const p = Math.min(1, Math.max(0, currentTime / duration));
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, trackH, trackH / 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(trackH, w * p), trackH, trackH / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * p, y + trackH / 2, 4.5 * S, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.font = `500 ${11 * S}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(fmtTime(currentTime), x, y - 9 * S);
  ctx.textAlign = 'right';
  ctx.fillText(fmtTime(duration), x + w, y - 9 * S);
}

export function drawLyricFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  artworkImg: HTMLImageElement | ImageBitmap,
  project: ProjectData,
  currentTime: number,
  accentColor: [number, number, number],
  state: RenderState,
  extras?: FrameExtras,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const portrait = H > W;
  const S = portrait ? W / 720 : W / 1280;
  const [ar, ag, ab] = accentColor;
  const lyrics = project.lyrics;
  const showEq = !!extras?.showEq;
  const showTimeline = !!extras?.showTimeline;
  const hasAlbum = !!project.album?.trim();
  const L = computeLayout(W, H, S, portrait, showEq, hasAlbum, showTimeline);

  // Static layer — rebuild when dims or EQ toggle change.
  const key = `${W}x${H}:${showEq}`;
  if (!state.staticLayer || state.staticKey !== key) {
    state.staticLayer = buildStaticLayer(artworkImg, project, W, H, S, L, accentColor);
    state.staticKey = key;
  }
  ctx.drawImage(state.staticLayer, 0, 0);

  // Active / scroll line
  let activeIdx = -1;
  let scrollIdx = 0;
  for (let i = 0; i < lyrics.length; i++) {
    const end = lyrics[i].end_time ?? (i + 1 < lyrics.length ? lyrics[i + 1].start_time : Infinity);
    if (currentTime >= lyrics[i].start_time && currentTime < end) { activeIdx = i; break; }
  }
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].start_time) { scrollIdx = i; break; }
  }

  // Time-based ease-out between lines (preview == render).
  const target = activeIdx >= 0 ? activeIdx : scrollIdx;
  const TRANSITION_SEC = 0.34;
  if (target !== state.targetOffset) {
    state.fromOffset = Math.abs(target - state.smoothOffset) > 2.5 ? target : state.smoothOffset;
    state.targetOffset = target;
    state.transitionStart = currentTime;
  }
  const tt = Math.min(1, Math.max(0, (currentTime - state.transitionStart) / TRANSITION_SEC));
  const eased = 1 - Math.pow(1 - tt, 3);
  state.smoothOffset = state.fromOffset + (state.targetOffset - state.fromOffset) * eased;

  const visible = 4;
  const scrollFrac = state.smoothOffset - Math.floor(state.smoothOffset);
  const CJK_NUDGE = 2 * S;
  const rX = Math.round(L.lyrColX);
  const rW = Math.round(L.lyrColW);
  const rCx = Math.round(L.lyrCx);
  const barFixedH = Math.round(L.barH);

  for (let offset = -(visible + 1); offset <= visible + 1; offset++) {
    const idx = Math.floor(state.smoothOffset) + offset;
    if (idx < 0 || idx >= lyrics.length) continue;
    const isActive = idx === activeIdx;
    const visualOffset = offset - scrollFrac;
    const y = L.lyrCenterY + visualOffset * L.lineH - L.lineH / 2;
    if (y < L.lyrTop || y > H - 10 * S) continue;
    const line = lyrics[idx];

    const sClr = getSingerColor(line.singer);
    const barR = sClr ? sClr[0] : ar;
    const barG = sClr ? sClr[1] : ag;
    const barB = sClr ? sClr[2] : ab;

    if (isActive) {
      const barTop = y - 2 * S;
      ctx.fillStyle = `rgba(${barR}, ${barG}, ${barB}, 0.75)`;
      ctx.beginPath();
      ctx.roundRect(rX, barTop, rW, barFixedH, 6 * S);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${L.activeFont}px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line.text, rCx, barTop + barFixedH / 2 + CJK_NUDGE, L.lyrMaxW);
      ctx.textBaseline = 'alphabetic';
    } else {
      const dist = Math.abs(visualOffset);
      const alpha = Math.max(0.06, 0.85 - dist * 0.18);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `400 ${L.inactiveFont}px ${FONT}`;
      ctx.fillStyle = `rgba(165, 165, 190, ${alpha})`;
      ctx.fillText(line.text, rCx, y + L.lineH / 2 + CJK_NUDGE, L.lyrMaxW);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // EQ form
  if (showEq && extras?.bands && extras.bands.length) {
    drawEqForm(ctx, L, S, extras.bands, state, toEqColor(accentColor));
  }

  // Timeline
  if (extras?.showTimeline && extras.duration && extras.duration > 0) {
    drawTimeline(ctx, L.tlX, L.tlY, L.tlW, S, currentTime, extras.duration);
  }

  // Singer badge (bottom-right) — only in landscape (portrait uses the title badge)
  const activeSinger = activeIdx >= 0 ? lyrics[activeIdx]?.singer : undefined;
  if (activeSinger && !portrait) {
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
