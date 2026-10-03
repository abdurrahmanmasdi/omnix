from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI
from app.core.config import settings

# Model names come from Settings (rule 12); these aliases keep existing imports working.
EMBEDDING_MODEL = settings.EMBEDDING_MODEL
EMBEDDING_DIMENSIONS = settings.EMBEDDING_DIMENSIONS


class LLMFactory:
    """
    Centralized factory for LLM instances (Dependency Inversion).
    Decouples LangGraph nodes from concrete model initialization.
    """
    
    @staticmethod
    def get_cheap_llm(temperature: float | None = None):
        return ChatOpenAI(
            model=settings.CHEAP_MODEL,
            api_key=settings.OPENAI_API_KEY, 
            temperature=settings.CHEAP_TEMPERATURE if temperature is None else temperature,
            model_kwargs={"reasoning_effort": "none"}
        )
    
    @staticmethod
    def get_extractor_llm(temperature: float | None = None):
        return ChatOpenAI(
            model=settings.EXTRACTOR_MODEL,
            api_key=settings.OPENAI_API_KEY, 
            temperature=settings.EXTRACTOR_TEMPERATURE if temperature is None else temperature,
            model_kwargs={"reasoning_effort": "none"}
        )

    @staticmethod
    def get_flagship_llm(temperature: float | None = None):
        return ChatOpenAI(
            model=settings.FLAGSHIP_MODEL,
            api_key=settings.OPENAI_API_KEY, 
            temperature=settings.FLAGSHIP_TEMPERATURE if temperature is None else temperature,
            model_kwargs={"reasoning_effort": "none"}
        )

    @staticmethod
    def get_async_openai_client():
        """Returns the native OpenAI async client (e.g. for Whisper)."""
        return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
