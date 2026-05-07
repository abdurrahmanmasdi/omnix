from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Sales Agent Engine"
    
    # Required keys
    OPENAI_API_KEY: str

    # This tells Pydantic to read from your .env file
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # @field_validator("DATABASE_URL")
    # @classmethod
    # def validate_database_url(cls, v: str) -> str:
    #     if not v.startswith("postgresql+asyncpg://"):
    #         raise ValueError("🔴 CRITICAL: DATABASE_URL must start with 'postgresql+asyncpg://'")
    #     return v

# Instantiate the settings so we can import it everywhere
settings = Settings()