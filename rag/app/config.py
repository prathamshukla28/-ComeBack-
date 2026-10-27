"""Environment-driven settings. Loaded once at import, validated by pydantic."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Gemini text-embedding-004 produces 768-dim vectors; this MUST match db/rag.sql.
EMBEDDING_DIM = 768


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Supabase
    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_anon_key: str = Field(..., alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field("", alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwt_secret: str = Field("", alias="SUPABASE_JWT_SECRET")

    # Gemini
    gemini_api_key: str = Field(..., alias="GEMINI_API_KEY")
    gemini_embed_model: str = Field("text-embedding-004", alias="GEMINI_EMBED_MODEL")
    gemini_chat_model: str = Field("gemini-2.0-flash", alias="GEMINI_CHAT_MODEL")

    # Retrieval
    kb_top_k: int = Field(5, alias="RAG_KB_TOP_K")
    memory_top_k: int = Field(5, alias="RAG_MEMORY_TOP_K")
    min_similarity: float = Field(0.35, alias="RAG_MIN_SIMILARITY")

    # Service
    cors_allow_origins: str = Field(
        "http://localhost:8081,http://localhost:19006", alias="CORS_ALLOW_ORIGINS"
    )
    log_level: str = Field("INFO", alias="LOG_LEVEL")
    # Per-user ceiling on paid (Gemini-backed) requests; 0 disables. SPEC-GAP-016.
    rate_limit_per_minute: int = Field(30, alias="RAG_RATE_LIMIT_PER_MINUTE")

    @property
    def rest_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/rest/v1"

    @property
    def auth_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so tests can override the env and clear the cache."""
    return Settings()  # type: ignore[call-arg]
