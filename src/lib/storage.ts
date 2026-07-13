/**
 * Local project storage — replaces the old FastAPI backend.
 *
 * Projects live under `$APPLOCALDATA/projects/<id>/` as:
 *   - audio.<ext>      (original audio, copied in on import)
 *   - artwork.<ext>    (cropped 1:1 album art)
 *   - project.json     (metadata + lyric timing)
 *
 * Media is surfaced to the webview via the asset protocol (`convertFileSrc`),
 * scoped to `$APPLOCALDATA` in tauri.conf.json. FFmpeg (in Rust) reads the real
 * paths directly.
 */
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  mkdir,
  writeFile,
  writeTextFile,
  readTextFile,
  readDir,
  remove,
  stat,
  exists,
} from '@tauri-apps/plugin-fs';
import type { ProjectData, LyricLine, RecentProject } from '../types';

async function projectsRoot(): Promise<string> {
  const base = await appLocalDataDir();
  const root = await join(base, 'projects');
  await mkdir(root, { recursive: true });
  return root;
}

export async function projectDir(id: string): Promise<string> {
  return join(await projectsRoot(), id);
}

export interface MediaInput {
  bytes: Uint8Array;
  ext: string;
}

export interface NewProjectInput {
  title: string;
  artist: string;
  lyrics: LyricLine[];
  audio: MediaInput;
  artwork: MediaInput;
  audioDuration?: number | null;
}

/** Create a new project directory, copy in media, and write metadata. Returns the id. */
export async function createProject(input: NewProjectInput): Promise<string> {
  const id = crypto.randomUUID();
  const dir = await projectDir(id);
  await mkdir(dir, { recursive: true });

  const audioName = `audio.${input.audio.ext}`;
  const artworkName = `artwork.${input.artwork.ext}`;
  await writeFile(await join(dir, audioName), input.audio.bytes);
  await writeFile(await join(dir, artworkName), input.artwork.bytes);

  const data: ProjectData = {
    project_id: id,
    title: input.title || 'Untitled',
    artist: input.artist || 'Unknown',
    audio_filename: audioName,
    artwork_filename: artworkName,
    lyrics: input.lyrics,
    audio_duration: input.audioDuration ?? null,
  };
  await writeTextFile(await join(dir, 'project.json'), JSON.stringify(data, null, 2));
  return id;
}

export async function loadProject(id: string): Promise<ProjectData> {
  const dir = await projectDir(id);
  const txt = await readTextFile(await join(dir, 'project.json'));
  return JSON.parse(txt) as ProjectData;
}

export async function saveProject(data: ProjectData): Promise<void> {
  const dir = await projectDir(data.project_id);
  await writeTextFile(await join(dir, 'project.json'), JSON.stringify(data, null, 2));
}

export async function deleteProject(id: string): Promise<void> {
  const dir = await projectDir(id);
  await remove(dir, { recursive: true });
}

/** List all stored projects, newest first (by project.json mtime). */
export async function listProjects(): Promise<RecentProject[]> {
  const root = await projectsRoot();
  let entries: { name: string; isDirectory: boolean }[];
  try {
    entries = (await readDir(root)) as { name: string; isDirectory: boolean }[];
  } catch {
    return [];
  }

  const rows: (RecentProject & { _mtime: number })[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const dir = await join(root, entry.name);
    const metaPath = await join(dir, 'project.json');
    if (!(await exists(metaPath))) continue;
    try {
      const meta = JSON.parse(await readTextFile(metaPath)) as ProjectData;
      let mtime = 0;
      try {
        const info = await stat(metaPath);
        mtime = info.mtime ? new Date(info.mtime).getTime() : 0;
      } catch {
        /* mtime is best-effort */
      }
      const hasArtwork =
        !!meta.artwork_filename && (await exists(await join(dir, meta.artwork_filename)));
      rows.push({
        project_id: meta.project_id ?? entry.name,
        title: meta.title ?? 'Untitled',
        artist: meta.artist ?? 'Unknown',
        lyrics_count: meta.lyrics?.length ?? 0,
        has_sync: (meta.lyrics ?? []).some((l) => (l.start_time ?? 0) > 0),
        has_artwork: hasArtwork,
        artwork_src: hasArtwork
          ? convertFileSrc(await join(dir, meta.artwork_filename))
          : undefined,
        _mtime: mtime,
      });
    } catch {
      /* skip corrupt project */
    }
  }

  rows.sort((a, b) => b._mtime - a._mtime);
  return rows.map(({ _mtime, ...rest }) => rest);
}

/** Absolute filesystem path to a file inside a project (for passing to FFmpeg). */
export async function projectFilePath(id: string, filename: string): Promise<string> {
  return join(await projectDir(id), filename);
}

/** `convertFileSrc` URL for an `<img>` / `<audio>` tag inside a project. */
export async function projectMediaSrc(id: string, filename: string): Promise<string> {
  return convertFileSrc(await projectFilePath(id, filename));
}
