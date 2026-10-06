"""WP-A A2 (KI-047): handoff text is truthful for the reason and localized."""
import asyncio
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import agent_pb2
from app.grpc_services import agent_servicer
from app.modules.safety.policy import (
    HANDOFF_MESSAGES, SAFE_HANDOFF_MESSAGE, detect_language, handoff_message,
)

TIME_PROMISE = re.compile(
    r"right now|shortly|immediately|in a few minutes|within|as soon as|asap|"
    r"hemen|birazdan|kısa süre|en kısa|dakika",
    re.IGNORECASE,
)


def _reply_for(monkeypatch, text):
    graph_call = AsyncMock(side_effect=AssertionError("graph should not run"))
    monkeypatch.setattr(agent_servicer, "agent_app", SimpleNamespace(ainvoke=graph_call))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_lead_info", AsyncMock(
        return_value=SimpleNamespace(lead_id="lead-a2", firstName="Synthetic", status="QUALIFYING")
    ))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_messages_by_ids", AsyncMock(
        return_value=[SimpleNamespace(id="msg-a2", content=text, mediaUrl=None, type="LEAD_TEXT")]
    ))
    return asyncio.run(agent_servicer.SalesAgentServicer().GenerateReply(
        agent_pb2.AgentRequest(organizationId="org-a2", conversationId="conv-a2", newMessageIds=["msg-a2"]),
        None,
    ))


@pytest.mark.parametrize("kind", sorted(HANDOFF_MESSAGES))
@pytest.mark.parametrize("language", ["en", "tr"])
def test_no_handoff_message_promises_timing(kind, language):
    assert not TIME_PROMISE.search(handoff_message(kind, language))


def test_language_detection_defaults_to_english():
    assert detect_language("Bir insanla konuşmak istiyorum") == "tr"
    assert detect_language("Merhaba, fiyat nedir") == "tr"
    assert detect_language("How much are implants?") == "en"
    assert detect_language("") == "en"


def test_turkish_human_request_gets_turkish_truthful_message(monkeypatch):
    reply = _reply_for(monkeypatch, "Bir insanla konuşmak istiyorum")
    assert reply.replyText == handoff_message("human_request", "tr")
    assert "yanıt" in reply.replyText
    assert reply.replyText != SAFE_HANDOFF_MESSAGE
    assert "safely" not in reply.replyText
    assert [a.type for a in reply.actions] == ["HANDOFF_TO_HUMAN"]


def test_english_human_request_does_not_claim_unsafe_question(monkeypatch):
    reply = _reply_for(monkeypatch, "Please connect me to a human")
    assert reply.replyText == handoff_message("human_request", "en")
    assert "safely" not in reply.replyText
    assert "team member" in reply.replyText


def test_blocked_medical_input_keeps_safe_message(monkeypatch):
    reply = _reply_for(monkeypatch, "Can you diagnose this swelling after my operation?")
    assert reply.replyText == SAFE_HANDOFF_MESSAGE == handoff_message("cannot_answer", "en")
    assert [a.type for a in reply.actions] == ["HANDOFF_TO_HUMAN"]
