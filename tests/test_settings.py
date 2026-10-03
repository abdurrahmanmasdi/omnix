"""WP-C C2.2 (KI-055, KI-006): models, temperatures and port come from Settings."""
import asyncio
import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock

from langchain_core.messages import AIMessage

import agent_pb2
from app.core.config import settings
from app.grpc_services import agent_servicer
from app.infrastructure.llm_factory import LLMFactory


def test_llm_factory_reads_models_and_temperatures_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "FLAGSHIP_MODEL", "synthetic-flagship")
    monkeypatch.setattr(settings, "EXTRACTOR_MODEL", "synthetic-extractor")
    monkeypatch.setattr(settings, "CHEAP_MODEL", "synthetic-cheap")
    monkeypatch.setattr(settings, "FLAGSHIP_TEMPERATURE", 0.25)
    monkeypatch.setattr(settings, "EXTRACTOR_TEMPERATURE", 0.15)
    monkeypatch.setattr(settings, "CHEAP_TEMPERATURE", 0.05)

    flagship = LLMFactory.get_flagship_llm()
    extractor = LLMFactory.get_extractor_llm()
    cheap = LLMFactory.get_cheap_llm()

    assert (flagship.model_name, flagship.temperature) == ("synthetic-flagship", 0.25)
    assert (extractor.model_name, extractor.temperature) == ("synthetic-extractor", 0.15)
    assert (cheap.model_name, cheap.temperature) == ("synthetic-cheap", 0.05)
    # An explicit temperature still wins.
    assert LLMFactory.get_flagship_llm(temperature=0.0).temperature == 0.0


def test_transcription_uses_the_configured_model(monkeypatch):
    monkeypatch.setattr(settings, "TRANSCRIPTION_MODEL", "synthetic-transcribe")
    create = AsyncMock(return_value=SimpleNamespace(text="How much are veneers?"))
    client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
    monkeypatch.setattr(agent_servicer.LLMFactory, "get_async_openai_client", lambda: client)
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_lead_info", AsyncMock(
        return_value=SimpleNamespace(lead_id="lead-c2", firstName="Synthetic", status="QUALIFYING"),
    ))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_messages_by_ids", AsyncMock(return_value=[]))

    async def invoke(state, config):
        return {**state, "messages": [*state["messages"], AIMessage(content="Pricing depends on the case.")]}

    monkeypatch.setattr(agent_servicer, "agent_app", SimpleNamespace(ainvoke=invoke))
    asyncio.run(agent_servicer.SalesAgentServicer().GenerateReply(agent_pb2.AgentRequest(
        organizationId="org-c2", conversationId="conv-c2", newMessageIds=[],
        audioBase64=base64.b64encode(b"synthetic-audio").decode(),
    ), None))

    assert create.await_args.kwargs["model"] == "synthetic-transcribe"
