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


def test_a_turn_past_the_deadline_hands_off_instead_of_running_on(monkeypatch):
    monkeypatch.setattr(settings, "TURN_DEADLINE_SECONDS", 0.05)
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_lead_info", AsyncMock(
        return_value=SimpleNamespace(lead_id="lead-c2", firstName="Synthetic", status="QUALIFYING"),
    ))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_messages_by_ids", AsyncMock(return_value=[
        SimpleNamespace(id="m1", content="How much are veneers?", type="LEAD_TEXT", mediaUrl=None),
    ]))

    async def slow_graph(state, config):
        await asyncio.sleep(5)
        raise AssertionError("the graph should have been cancelled")

    monkeypatch.setattr(agent_servicer, "agent_app", SimpleNamespace(ainvoke=slow_graph))
    started = time.monotonic()
    reply = asyncio.run(agent_servicer.SalesAgentServicer().GenerateReply(agent_pb2.AgentRequest(
        organizationId="org-c2", conversationId="conv-c2", newMessageIds=["m1"],
    ), None))

    assert time.monotonic() - started < 2
    assert reply.replyText == handoff_message("technical", "en")
    assert [action.type for action in reply.actions] == ["HANDOFF_TO_HUMAN"]
