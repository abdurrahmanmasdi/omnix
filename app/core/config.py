import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Sales Agent Engine"
    
    # Required keys — must be supplied per environment (Railway sets these).
    OPENAI_API_KEY: str
    DATABASE_URL: str

    # This tells Pydantic to read from your .env file
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

# Instantiate the settings so we can import it everywhere
settings = Settings()
