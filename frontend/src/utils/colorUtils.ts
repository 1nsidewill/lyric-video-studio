export function getDominantColor(img: HTMLImageElement): [number, number, number] {
  const c = document.createElement('canvas');
  c.width = 40; c.height = 40;
  const ctx = c.getContext('2d');
  if (!ctx) return [200, 160, 80];
  ctx.drawImage(img, 0, 0, 40, 40);
  const d = ctx.getImageData(0, 0, 40, 40).data;
  const buckets: Record<string, { count: number; r: number; g: number; b: number }> = {};
  for (let i = 0; i < d.length; i += 4) {
    const r = (d[i] >> 4) << 4, g = (d[i+1] >> 4) << 4, b = (d[i+2] >> 4) << 4;
    if (Math.max(r,g,b) < 50 || Math.max(r,g,b) - Math.min(r,g,b) < 20) continue;
    const k = `${r},${g},${b}`;
    if (!buckets[k]) buckets[k] = { count: 0, r, g, b };
    buckets[k].count++;
  }
  let best = { count: 0, r: 200, g: 160, b: 80 };
  for (const b of Object.values(buckets)) if (b.count > best.count) best = b;
  return [Math.min(255, best.r * 1.3), Math.min(255, best.g * 1.3), Math.min(255, best.b * 1.3)];
}
