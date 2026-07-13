export interface LyricLine {
  index: number;
  text: string;
  start_time: number;
  end_time: number | null;
  singer?: string;
}

export type AspectRatio = '16:9' | '9:16';

export interface RenderOptions {
  show_eq: boolean;
  show_timeline: boolean;
  aspect: AspectRatio;
}

export interface ProjectData {
  project_id: string;
  title: string;
  artist: string;
  /** Optional album name (shown under the track/artist when present). */
  album?: string;
  audio_filename: string;
  artwork_filename: string;
  lyrics: LyricLine[];
  audio_duration: number | null;
  render_options?: RenderOptions;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  show_eq: true,
  show_timeline: true,
  aspect: '16:9',
};

export type AppStep = 'upload' | 'sync' | 'preview' | 'generate';

export interface RecentProject {
  project_id: string;
  title: string;
  artist: string;
  lyrics_count: number;
  has_sync: boolean;
  has_artwork: boolean;
  /** `convertFileSrc` URL for the album art thumbnail, if present. */
  artwork_src?: string;
}

export interface VideoStatus {
  project_id: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  output_filename: string | null;
  error: string | null;
}
