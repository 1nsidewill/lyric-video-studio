/** Sketch persistence under $APPLOCALDATA/sketches/: sessions index + WAV takes. */
import { invoke } from '@tauri-apps/api/core';
import { mkdir, readFile, readTextFile, writeFile, writeTextFile, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
import { DEFAULT_CHAIN, type ChainSettings } from './sketchEngine';

export interface SketchTakeRecord {
  id: string;
  file: string;        // relative to appdata
  offset_sec: number;
  enabled: boolean;
  created_at: string;
}

export interface SketchSession {
  id: string;
  beat_title: string;
  beat_file: string;   // relative to appdata (copied in)
  key: string | null;
  bpm: number | null;
  takes: SketchTakeRecord[];
  chain: ChainSettings;
  created_at: string;
  updated_at: string;
}

const INDEX = 'sketches/sketches.json';
const base = { baseDir: BaseDirectory.AppLocalData } as const;

/** Beats saved by the Downloader module (beats/beats.json). */
export interface LibraryBeat {
  id: string;
  title: string;
  uploader: string;
  key: string | null;
  bpm: number | null;
  file_path: string;
}

export async function listLibraryBeats(): Promise<LibraryBeat[]> {
  try {
    return JSON.parse(await readTextFile('beats/beats.json', base)) as LibraryBeat[];
  } catch { return []; }
}

export async function listSessions(): Promise<SketchSession[]> {
  try {
    return JSON.parse(await readTextFile(INDEX, base)) as SketchSession[];
  } catch { return []; }
}

async function saveIndex(sessions: SketchSession[]): Promise<void> {
  await mkdir('sketches', { ...base, recursive: true }).catch(() => {});
  await writeTextFile(INDEX, JSON.stringify(sessions, null, 2), base);
}

/** Create a session from a beat file anywhere on disk (Rust copies it into scope). */
export async function createSession(opts: {
  beatTitle: string;
  beatAbsPath: string;
  key: string | null;
  bpm: number | null;
}): Promise<SketchSession> {
  const id = `sk-${Date.now()}`;
  const ext = (opts.beatAbsPath.split('.').pop() || 'wav').toLowerCase();
  const beatRel = `sketches/${id}/beat.${ext}`;
  await invoke('import_beat', { src: opts.beatAbsPath, destRel: beatRel });
  const now = new Date().toISOString();
  const session: SketchSession = {
    id,
    beat_title: opts.beatTitle,
    beat_file: beatRel,
    key: opts.key,
    bpm: opts.bpm,
    takes: [],
    chain: { ...DEFAULT_CHAIN },
    created_at: now,
    updated_at: now,
  };
  const sessions = await listSessions();
  await saveIndex([session, ...sessions]);
  return session;
}

export async function updateSession(updated: SketchSession): Promise<void> {
  const sessions = await listSessions();
  updated.updated_at = new Date().toISOString();
  await saveIndex(sessions.map(s => (s.id === updated.id ? updated : s)));
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await listSessions();
  await saveIndex(sessions.filter(s => s.id !== id));
  await remove(`sketches/${id}`, { ...base, recursive: true }).catch(() => {});
}

export async function readBeatBytes(session: SketchSession): Promise<Uint8Array> {
  return readFile(session.beat_file, base);
}

export async function saveTakeWav(sessionId: string, takeId: string, wav: Uint8Array): Promise<string> {
  const rel = `sketches/${sessionId}/${takeId}.wav`;
  await mkdir(`sketches/${sessionId}`, { ...base, recursive: true }).catch(() => {});
  await writeFile(rel, wav, base);
  return rel;
}

export async function readTakeBytes(rel: string): Promise<Uint8Array> {
  return readFile(rel, base);
}

export async function deleteTakeFile(rel: string): Promise<void> {
  await remove(rel, base).catch(() => {});
}
