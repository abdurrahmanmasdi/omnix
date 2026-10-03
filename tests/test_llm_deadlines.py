"""WP-C C2.2 (KI-055): explicit LLM timeouts/retries and an overall turn deadline under Nest's 30 s."""
import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

import agent_pb2
from app.core.config import Settings, settings
from app.grpc_services import agent_servicer
from app.infrastructure.llm_factory import LLMFactory
from app.modules.safety.policy import handoff_message


def test_every_model_client_has_a_timeout_and_bounded_retries(monkeypatch):
    monkeypatch.setattr(settings, "LLM_TIMEOUT_SECONDS", 7.5)
    monkeypatch.setattr(settings, "LLM_MAX_RETRIES", 2)
    for llm in (LLMFactory.get_flagship_llm(), LLMFactory.get_extractor_llm(), LLMFactory.get_cheap_llm()):
        assert (llm.request_timeout, llm.max_retries) == (7.5, 2)
    client = LLMFactory.get_async_openai_client()
    assert (client.timeout, client.max_retries) == (7.5, 2)
    embeddings = LLMFactory.get_embeddings()
    assert (embeddings.request_timeout, embeddings.max_retries) == (7.5, 2)
    assert (embeddings.model, embeddings.dimensions) == (settings.EMBEDDING_MODEL, settings.EMBEDDING_DIMENSIONS)


def test_turn_deadline_must_stay_under_nest_timeout():
    base = dict(OPENAI_API_KEY="k", DATABASE_URL="postgresql://s:s@127.0.0.1/s", INTERNAL_RPC_SECRET="r")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, TURN_DEADLINE_SECONDS=30, **base)
    assert Settings(_env_file=None, **base).TURN_DEADLINE_SECONDS < 30

