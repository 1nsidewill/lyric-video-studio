from pydantic import BaseModel


class LyricLine(BaseModel):
    index: int
    text: str
    start_time: float  # seconds
    end_time: float | None = None
    singer: str | None = None


class ProjectData(BaseModel):
    project_id: str
    title: str
    artist: str
    audio_filename: str
    artwork_filename: str
    lyrics: list[LyricLine]
    audio_duration: float | None = None


class VideoGenerateRequest(BaseModel):
    project_id: str
    style: str = "default"
    resolution: str = "1920x1080"
    fps: int = 30


class VideoStatus(BaseModel):
    project_id: str
    status: str  # pending, processing, done, error
    progress: float = 0.0
    output_filename: str | None = None
    error: str | None = None
