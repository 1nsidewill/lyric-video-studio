/**
 * Parse musical metadata (key / BPM) out of type-beat captions — video titles and
 * descriptions follow strong conventions like:
 *   "[FREE] Drake Type Beat "Night" | 140 BPM | F# minor"
 *   "(FREE) hard trap beat 2026 – prod. xxx [Am 148bpm]"
 * Everything is heuristic: we prefer explicit "key"/"bpm" labels, then bracketed
 * tokens, then bare tokens with guards against English words like "Am".
 */

export interface ParsedBeatMeta {
  bpm: number | null;
  key: string | null;
}

const NOTE = '[A-Ga-g](?:#|♯|b|♭)?';

/** Enharmonic normalization: flats → the sharp spelling producers usually type. */
const FLAT_TO_SHARP: Record<string, string> = {
  Ab: 'G#', Bb: 'A#', Cb: 'B', Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#',
};

/** Normalize a (note, quality) capture to compact form: "F#m", "Am", "C". */
export function normalizeKey(noteRaw: string, qualityRaw?: string): string {
  let n = noteRaw.replace('♯', '#').replace('♭', 'b');
  n = n[0].toUpperCase() + (n[1] ?? '');
  if (n.length === 2 && n[1] === 'b') n = FLAT_TO_SHARP[n] ?? n;
  const q = (qualityRaw ?? '').toLowerCase();
  const minor = q === 'm' || q.startsWith('min');
  return minor ? `${n}m` : n;
}

/** BPM: a 2–3 digit number adjacent to "bpm", constrained to the 30–200 range. */
export function parseBpm(text: string): number | null {
  const m =
    text.match(/(\d{2,3})\s*bpm\b/i) ??
    text.match(/\bbpm\s*[:\-–]?\s*(\d{2,3})/i) ??
    text.match(/\btempo\s*[:\-–]?\s*(\d{2,3})/i) ??
    // BeatStars-style combined label puts the number at a distance:
    // "Key|Bpm - G sharp major|115". Allow a short non-digit gap after "bpm".
    text.match(/\bbpm\b[^\d\n]{0,24}(\d{2,3})\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 30 && n <= 200 ? n : null;
}

/** Fold word-form accidentals into symbols: "G sharp" → "G#", "B flat" → "Bb". */
function foldAccidentalWords(text: string): string {
  return text
    .replace(/\b([A-Ga-g])[\s-]*(?:sharp|♯)\b/gi, '$1#')
    .replace(/\b([A-Ga-g])[\s-]*flat\b/gi, '$1b');
}

export function parseKey(rawText: string): string | null {
  const text = foldAccidentalWords(rawText);
  // 0) BeatStars combined label: "Key|Bpm - G# major|115", "Key/BPM: Am/140"
  const combo = text.match(
    new RegExp(String.raw`\bkey\s*[|/]\s*bpm\s*[-:–—]*\s*(${NOTE})\s*(major|minor|maj|min|m)?\b`, 'i'));
  if (combo) return normalizeKey(combo[1], combo[2]);

  // 1) Explicit label: "Key: Am", "key of F# minor", "KEY - Dbm"
  const labeled = text.match(
    new RegExp(String.raw`\bkey(?:\s*of)?\s*[:\-–]?\s*(${NOTE})\s*(major|minor|maj|min|m)?\b`, 'i'));
  if (labeled) return normalizeKey(labeled[1], labeled[2]);

  // 2) Bracketed token: "(Am)", "[F#m]", "(148bpm Gm)" — uppercase note only.
  const br = text.match(/[[(][^\])]*?\b([A-G](?:#|♯|b|♭)?)\s*(maj(?:or)?|min(?:or)?|m)\b[^\])]*?[\])]/);
  if (br) return normalizeKey(br[1], br[2]);

  // 3) Full quality word anywhere: "F# minor", "a Minor"
  const full = text.match(new RegExp(String.raw`\b(${NOTE})\s+(major|minor)\b`, 'i'));
  if (full) return normalizeKey(full[1], full[2]);

  // 4) Compact "F#m" / "Ebm" — an accidental makes it unambiguous.
  const acc = text.match(/\b([A-G](?:#|♯|b|♭))m\b/);
  if (acc) return normalizeKey(acc[1], 'm');

  // 5) Bare "Am"/"Gm" style tokens are ambiguous English ("Who Am I"), so only
  //    accept them when the text also carries a BPM figure (the "140bpm Am" idiom)
  //    or a musical marker word.
  if (/\d{2,3}\s*bpm\b/i.test(text) || /\b(?:beat|instrumental|prod)\b/i.test(text)) {
    const bare = text.match(/\b([A-G])(m)\b/);
    if (bare && !/\b(?:who|what|where|why|how|i)\s+am\b/i.test(text)) {
      return normalizeKey(bare[1], 'm');
    }
    const bareMajor = text.match(/\b([A-G](?:#|♯|b|♭)?)\s+major\b/i);
    if (bareMajor) return normalizeKey(bareMajor[1]);
  }
  return null;
}

export function parseBeatMeta(title: string, description: string): ParsedBeatMeta {
  // The title is the highest-signal line; then scan the description top-down.
  const sources = [title, ...description.split('\n')];
  let bpm: number | null = null;
  let key: string | null = null;
  for (const line of sources) {
    if (bpm === null) bpm = parseBpm(line);
    if (key === null) key = parseKey(line);
    if (bpm !== null && key !== null) break;
  }
  return { bpm, key };
}

/** Windows/macOS-safe filename from beat fields: "uploader - title [140bpm Am]". */
export function beatFilename(title: string, uploader: string, bpm: number | null, key: string | null): string {
  const tags = [bpm ? `${bpm}bpm` : null, key].filter(Boolean).join(' ');
  const base = [uploader, title].filter(Boolean).join(' - ') + (tags ? ` [${tags}]` : '');
  return base
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim()
    .slice(0, 180);
}
