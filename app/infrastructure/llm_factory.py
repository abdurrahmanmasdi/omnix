from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI
from app.core.config import settings

class LLMFactory:
    """
    Centralized factory for LLM instances (Dependency Inversion).
    Decouples LangGraph nodes from concrete model initialization.
    """
    
    @staticmethod
    def get_extractor_llm(temperature: float = 0.1):
        return ChatOpenAI(
            model="gpt-5.6-luna", 
            api_key=settings.OPENAI_API_KEY, 
            temperature=temperature,
            model_kwargs={"reasoning_effort": "none"}
        )

    @staticmethod
    def get_flagship_llm(temperature: float = 0.3):
        return ChatOpenAI(
            model="gpt-5.6-terra", 
            api_key=settings.OPENAI_API_KEY, 
            temperature=temperature,
            model_kwargs={"reasoning_effort": "none"}
        )

    @staticmethod
    def get_async_openai_client():
        """Returns the native OpenAI async client (e.g. for Whisper)."""
        return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

