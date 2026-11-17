"""Runtime configuration, read from environment variables (see .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_dotenv() -> None:
    """Minimal .env support (repo root or backend/), without overriding real env variables."""
    here = Path(__file__).resolve()
    for path in (here.parents[2] / ".env", here.parents[1] / ".env"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            if value:
                os.environ.setdefault(key.strip(), value)


_load_dotenv()


def _normalize_db_url(url: str) -> str:
    # Heroku/Render style URLs -> SQLAlchemy psycopg3 driver.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _llm_mode() -> str:
    """'on' | 'off' | 'auto' (auto = enabled when an Anthropic credential is present)."""
    raw = os.getenv("MIRROR_LLM", "auto").strip().lower()
    return raw if raw in {"on", "off", "auto"} else "auto"


@dataclass(frozen=True)
class Settings:
    database_url: str = field(
        default_factory=lambda: _normalize_db_url(os.getenv("DATABASE_URL", "sqlite:///./mirror_ai.db"))
    )
    llm_mode: str = field(default_factory=_llm_mode)
    llm_model: str = field(default_factory=lambda: os.getenv("MIRROR_LLM_MODEL", "claude-opus-5-5"))
    llm_effort: str = field(default_factory=lambda: os.getenv("MIRROR_LLM_EFFORT", "medium"))
    llm_timeout_seconds: float = field(default_factory=lambda: float(os.getenv("MIRROR_LLM_TIMEOUT", "90")))

    @property
    def llm_enabled(self) -> bool:
        if self.llm_mode == "off":
            return False
        if self.llm_mode == "on":
            return True
        return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))


def get_settings() -> Settings:
    return Settings()
