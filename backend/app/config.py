from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "development"
    upload_dir: str = "uploads"
    output_dir: str = "output"
    max_upload_size_mb: int = 100
    cors_origins: str = "http://localhost:5173"

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def output_path(self) -> Path:
        p = Path(self.output_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
