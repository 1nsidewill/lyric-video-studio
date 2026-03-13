export interface LyricLine {
  index: number;
  text: string;
  start_time: number;
  end_time: number | null;
  singer?: string;
}

export interface ProjectData {
  project_id: string;
  title: string;
  artist: string;
  audio_filename: string;
  artwork_filename: string;
  lyrics: LyricLine[];
  audio_duration: number | null;
}

export type AppStep = 'upload' | 'sync' | 'preview' | 'generate';

export interface RecentProject {
  project_id: string;
  title: string;
  artist: string;
  lyrics_count: number;
  has_sync: boolean;
  has_artwork: boolean;
}

export interface VideoStatus {
  project_id: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  output_filename: string | null;
  error: string | null;
}
