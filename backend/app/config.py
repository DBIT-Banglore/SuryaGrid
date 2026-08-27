"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Suryagrid AI"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Database — defaults to local SQLite (no server needed); set DATABASE_URL
    # to a postgresql+asyncpg URL for production / TimescaleDB.
    DATABASE_URL: str = "sqlite+aiosqlite:///./suryagrid.db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Data mode (Phase 1.7). "real" forbids any synthetic/demo fallback; "demo"
    # permits labelled synthetic data for offline UI demos only.
    APP_DATA_MODE: str = "real"
    # Default target region for real-data ML (Bengaluru/Karnataka/India project).
    DEFAULT_REGION: str = "bengaluru"

    # Weather provider (Phase 1.5). Open-Meteo is key-less; others reserved.
    WEATHER_PROVIDER: str = "open-meteo"
    WEATHER_API_BASE_URL: str = "https://api.open-meteo.com/v1/forecast"

    # NREL NSRDB (historical satellite irradiance; training/backtesting only).
    # Free key at https://developer.nrel.gov/signup - without it the provider
    # raises NOT_AVAILABLE instead of silently falling back.
    NREL_API_KEY: str = ""
    NREL_API_EMAIL: str = ""

    # DSM defaults (see docs/DSM_RULE_SOURCES.md)
    DSM_DEFAULT_REGION: str = "Karnataka"
    DSM_DEFAULT_RULE_PROFILE: str = "kerc-solar"

    # Security
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # Real-time ingestion scheduler (off by default; opt-in for live polling)
    SCHEDULER_ENABLED: bool = False
    INGEST_INTERVAL_MINUTES: int = 15

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
