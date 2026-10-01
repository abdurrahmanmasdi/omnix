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

    # This tells Pydantic to read from your .env file
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

# Instantiate the settings so we can import it everywhere
settings = Settings()
