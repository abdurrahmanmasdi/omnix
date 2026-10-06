from typing import Literal
from uuid import UUID

from app.infrastructure.model_options import optional_temperature, optional_reasoning

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration, validated at import: a missing or invalid value stops startup.

    Names are listed in .env.example. Validation errors never include input values
    (hide_input_in_errors), so a secret is never echoed into logs.
    """

    PROJECT_NAME: str = "AI Sales Agent Engine"

    # Required keys — must be supplied per environment (Railway sets these).
    OPENAI_API_KEY: str = Field(min_length=1)
    DATABASE_URL: str = Field(min_length=1)
    INTERNAL_RPC_SECRET: str = Field(min_length=1)
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    # D-014: autonomous dental-image interpretation is disabled for launch.
    # Off: patient photos are never sent to a model (KI-058).
    PATIENT_IMAGE_ANALYSIS_ENABLED: bool = False

    # Models and optional sampling settings are per role; unset/empty = provider default.
    FLAGSHIP_MODEL: str = Field("gpt-5.6-luna", min_length=1)
    EXTRACTOR_MODEL: str = Field("gpt-5.6-terra", min_length=1)
    CHEAP_MODEL: str = Field("gpt-5.6-luna", min_length=1)
    TRANSCRIPTION_MODEL: str = Field("gpt-4o-mini-transcribe", min_length=1)
    EMBEDDING_MODEL: str = Field("text-embedding-3-large", min_length=1)
    # Must match the pgvector column size.
    EMBEDDING_DIMENSIONS: int = Field(3072, gt=0)
    FLAGSHIP_TEMPERATURE: float | None = None
    FLAGSHIP_REASONING_EFFORT: str | None = None
    EXTRACTOR_TEMPERATURE: float | None = None
    EXTRACTOR_REASONING_EFFORT: str | None = None
    CHEAP_TEMPERATURE: float | None = None
    CHEAP_REASONING_EFFORT: str | None = None

    COORDINATOR_V2_ORG_IDS: str = ""
    COORDINATOR_KNOWLEDGE_MAX_CHARS: int = Field(24000, gt=0, le=200000)

    GRPC_PORT: int = Field(50051, ge=1, le=65535)
    # Internal gRPC transport (KI-002), same switch name as the Nest backend; see
    # app/core/grpc_transport.py. Material is checked when the server starts.
    INTERNAL_GRPC_TLS: Literal["required", "disabled"] = "required"
    INTERNAL_GRPC_PRIVATE_NETWORK: bool = False
    INTERNAL_GRPC_TLS_CERT: str | None = None
    INTERNAL_GRPC_TLS_KEY: str | None = None
    INTERNAL_GRPC_TLS_CERT_B64: str | None = None
    INTERNAL_GRPC_TLS_KEY_B64: str | None = None

    # Every model/embedding/transcription call gets a timeout and bounded retries (KI-055).
    LLM_TIMEOUT_SECONDS: float = Field(20.0, gt=0, le=120)
    LLM_MAX_RETRIES: int = Field(1, ge=0, le=5)
    # Whole GenerateReply turn; must stay under Nest's 30 s gRPC timeout so Nest gets
    # a deliberate handoff instead of an abandoned call.
    TURN_DEADLINE_SECONDS: float = Field(25.0, gt=0, lt=30)

    # This tells Pydantic to read from your .env file
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        str_strip_whitespace=True,
        hide_input_in_errors=True,
    )

    @field_validator("FLAGSHIP_TEMPERATURE", "EXTRACTOR_TEMPERATURE", "CHEAP_TEMPERATURE", mode="before")
    @classmethod
    def _temperature(cls, value):
        return optional_temperature(value)

    @field_validator("FLAGSHIP_REASONING_EFFORT", "EXTRACTOR_REASONING_EFFORT", "CHEAP_REASONING_EFFORT", mode="before")
    @classmethod
    def _reasoning(cls, value):
        return optional_reasoning(value)

    @field_validator("COORDINATOR_V2_ORG_IDS")
    @classmethod
    def _coordinator_orgs(cls, value):
        if not value.strip():
            return ""
        try:
            ids = [str(UUID(part.strip())) for part in value.split(',')]
        except (ValueError, AttributeError):
            raise ValueError("COORDINATOR_V2_ORG_IDS must contain comma-separated UUIDs") from None
        if len(set(ids)) != len(ids):
            raise ValueError("COORDINATOR_V2_ORG_IDS must not contain duplicates")
        return ','.join(ids)

    @field_validator("DATABASE_URL")
    @classmethod
    def _postgres_url(cls, value: str) -> str:
        if not value.startswith(("postgresql://", "postgres://", "postgresql+psycopg2://")):
            raise ValueError("DATABASE_URL must be a postgresql:// URL")
        return value

    @model_validator(mode="after")
    def _production_secret_strength(self):
        if self.ENVIRONMENT == "production" and len(self.INTERNAL_RPC_SECRET) < 32:
            raise ValueError("INTERNAL_RPC_SECRET must be at least 32 characters in production")
        return self


# Instantiate the settings so we can import it everywhere
settings = Settings()
