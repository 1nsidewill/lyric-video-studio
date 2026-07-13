import type { LyricLine } from '../types';

/**
 * Post-process lyrics: detect [Name] tag lines, assign singer to subsequent lines,
 * and remove the tag lines themselves. Works on both fresh and legacy data.
 */
export function parseSingerTags(lyrics: LyricLine[]): LyricLine[] {
  const hasSingerAlready = lyrics.some(l => l.singer);
  if (hasSingerAlready) return lyrics;

  const result: LyricLine[] = [];
  let currentSinger: string | undefined;
  let idx = 0;

  for (const line of lyrics) {
    const tagMatch = line.text.trim().match(/^\[(.+)\]$/);
    if (tagMatch) {
      currentSinger = tagMatch[1].trim();
      continue;
    }
    result.push({ ...line, index: idx++, singer: currentSinger });
  }

  return result;
}
