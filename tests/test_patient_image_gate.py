"""WP-A A13 (KI-058, D-014): patient photos are not sent to a model unless enabled."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

from langchain_core.messages import AIMessage

import agent_pb2
from app.core.config import settings
from app.grpc_services import agent_servicer
from app.modules.agent import nodes
from app.modules.agent.graph_builder import agent_app
from app.modules.agent.prompts import VISION_PROMPT

IMAGE = "data:image/jpeg;base64,c3ludGhldGlj"


class RecordingModel:
    def __init__(self):
        self.seen = []

    def bind_tools(self, selected):
        return self

    async def ainvoke(self, messages):
        self.seen.append(messages)
        if messages and str(messages[0].content) == VISION_PROMPT:
            return AIMessage(content="A close-up photo of teeth.")
        return AIMessage(content="Thank you, we received your photo.")


class Structured:
    def __init__(self, record):
        self.record = record

    def with_structured_output(self, schema):
        self.schema = schema
        return self

    async def ainvoke(self, messages):
        self.record.append(messages)
        if self.schema.__name__ == "ExtractionOutput":
            # Worst case: the extractor claims a medical image anyway.
            return SimpleNamespace(name=None, service_interested="implants", is_medical_image=True,
                                   customer_intent="inquiry", active_objection="none")
        return SimpleNamespace(is_compliant=True, feedback=None)


def _run(monkeypatch, enabled):
    monkeypatch.setattr(settings, "PATIENT_IMAGE_ANALYSIS_ENABLED", enabled)
    model, structured_calls = RecordingModel(), []
    monkeypatch.setattr(nodes.LLMFactory, "get_flagship_llm", lambda: model)
    monkeypatch.setattr(nodes.LLMFactory, "get_extractor_llm", lambda: Structured(structured_calls))
    monkeypatch.setattr(nodes.LLMFactory, "get_cheap_llm", lambda: Structured(structured_calls))
    monkeypatch.setattr(agent_servicer, "agent_app", agent_app)
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_lead_info", AsyncMock(
        return_value=SimpleNamespace(lead_id="lead-a13", firstName="Synthetic", status="NEW"),
    ))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_messages_by_ids", AsyncMock(return_value=[
        SimpleNamespace(id="img", content="Here is my smile", type="LEAD_MEDIA", mediaUrl=IMAGE),
    ]))
    reply = asyncio.run(agent_servicer.SalesAgentServicer().GenerateReply(agent_pb2.AgentRequest(
        organizationId="org-a13", conversationId="conv-a13", newMessageIds=["img"],
    ), None))
    sent = json.dumps([[str(m.content) for m in batch] for batch in model.seen + structured_calls])
    return reply, model, sent


def test_image_not_sent_to_any_model_when_disabled(monkeypatch):
    reply, model, sent = _run(monkeypatch, enabled=False)
    assert IMAGE not in sent and "image_url" not in sent
    assert not any(str(batch[0].content) == VISION_PROMPT for batch in model.seen)
    assert "Image analysis is disabled" in sent  # the model is told it cannot see the photo
    statuses = [json.loads(a.payload).get("status") for a in reply.actions if a.type == "UPDATE_LEAD"]
    assert "QUALIFIED" not in statuses


def test_image_analysis_still_works_when_enabled(monkeypatch):
    reply, model, sent = _run(monkeypatch, enabled=True)
    assert any(str(batch[0].content) == VISION_PROMPT for batch in model.seen)
    assert IMAGE in sent
