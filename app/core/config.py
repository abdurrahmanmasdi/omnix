import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Sales Agent Engine"
    
    # Required keys — must be supplied per environment (Railway sets these).
    OPENAI_API_KEY: str
    DATABASE_URL: str
    INTERNAL_RPC_SECRET: str
    ENVIRONMENT: str = "development"
    # D-014: autonomous dental-image interpretation is disabled for launch.
    # Off: patient photos are never sent to a model (KI-058).
    PATIENT_IMAGE_ANALYSIS_ENABLED: bool = False

    # Models (rule 12: from config, not code). reasoning_effort "none" stays in the factory.
    FLAGSHIP_MODEL: str = "gpt-5.6-luna"
    EXTRACTOR_MODEL: str = "gpt-5.6-terra"
    CHEAP_MODEL: str = "gpt-5.6-luna"
    TRANSCRIPTION_MODEL: str = "gpt-4o-mini-transcribe"
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    # Must match the pgvector column size.
    EMBEDDING_DIMENSIONS: int = 3072
    FLAGSHIP_TEMPERATURE: float = 0.3
    EXTRACTOR_TEMPERATURE: float = 0.1
    CHEAP_TEMPERATURE: float = 0.0

    GRPC_PORT: int = 50051

    # This tells Pydantic to read from your .env file
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

# Instantiate the settings so we can import it everywhere
settings = Settings()
