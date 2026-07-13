const PALETTE: [number, number, number][] = [
  [220, 130, 70],   // warm orange
  [100, 180, 255],  // sky blue
  [230, 100, 160],  // pink
  [120, 220, 160],  // mint green
  [180, 130, 255],  // lavender
  [255, 200, 80],   // gold
  [100, 220, 220],  // teal
  [255, 130, 130],  // coral
  [160, 200, 100],  // lime
  [200, 160, 220],  // mauve
];

const singerIndexMap = new Map<string, number>();

export function getSingerColor(singer: string | undefined): [number, number, number] | null {
  if (!singer) return null;
  const key = singer.toLowerCase().trim();
  if (!singerIndexMap.has(key)) {
    singerIndexMap.set(key, singerIndexMap.size);
  }
  return PALETTE[singerIndexMap.get(key)! % PALETTE.length];
}

export function resetSingerColors() {
  singerIndexMap.clear();
}

export function getAllSingers(): string[] {
  return [...singerIndexMap.keys()];
}
