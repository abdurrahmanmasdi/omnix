from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI
from app.core.config import settings

# ─── CENTRALIZED MODEL CONSTANTS ────────────────────────
# Change these to swap models across the entire service.
FLAGSHIP_MODEL = "gpt-5.6-luna"
EXTRACTOR_MODEL = "gpt-5.6-terra"
CHEAP_MODEL = "gpt-5.6-luna"
EMBEDDING_MODEL = "text-embedding-3-large"
EMBEDDING_DIMENSIONS = 3072


class LLMFactory:
    """
    Centralized factory for LLM instances (Dependency Inversion).
    Decouples LangGraph nodes from concrete model initialization.
    """
    
    @staticmethod
    def get_cheap_llm(temperature: float = 0.0):
        return ChatOpenAI(
            model=CHEAP_MODEL, 
            api_key=settings.OPENAI_API_KEY, 
            temperature=temperature,
            model_kwargs={"reasoning_effort": "none"}
        )
    
    @staticmethod
    def get_extractor_llm(temperature: float = 0.1):
        return ChatOpenAI(
            model=EXTRACTOR_MODEL, 
            api_key=settings.OPENAI_API_KEY, 
            temperature=temperature,
            model_kwargs={"reasoning_effort": "none"}
        )

    @staticmethod
    def get_flagship_llm(temperature: float = 0.3):
        return ChatOpenAI(
            model=FLAGSHIP_MODEL, 
            api_key=settings.OPENAI_API_KEY, 
            temperature=temperature,
            model_kwargs={"reasoning_effort": "none"}
        )

    @staticmethod
    def get_async_openai_client():
        """Returns the native OpenAI async client (e.g. for Whisper)."""
        return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
