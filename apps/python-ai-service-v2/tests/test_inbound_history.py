from types import SimpleNamespace
from types import ModuleType
from unittest.mock import AsyncMock
import asyncio
import importlib
import sys

from langchain_core.messages import AIMessage, HumanMessage

import agent_pb2


def test_current_message_is_not_repeated_in_history(monkeypatch):
    # The graph is exercised separately; supply a recording graph at this
    # boundary so this test checks the gRPC message assembly contract.
    graph_module = ModuleType("app.modules.agent.graph_builder")
    graph_module.agent_app = SimpleNamespace()
    monkeypatch.setitem(sys.modules, graph_module.__name__, graph_module)
    agent_servicer = importlib.import_module("app.grpc_services.agent_servicer")
    previous = SimpleNamespace(id="old", content="Earlier question", type="LEAD_TEXT")
    current = SimpleNamespace(id="new", content="Current question", type="LEAD_TEXT", mediaUrl=None)
    monkeypatch.setattr(
        agent_servicer.DatabaseService,
        "get_conversation_lead_info",
        AsyncMock(return_value=SimpleNamespace(
            lead_id=None, firstName="Guest", externalContactId="15550000000",
        )),
    )
    monkeypatch.setattr(
        agent_servicer.DatabaseService,
        "get_conversation_history",
        AsyncMock(return_value=[previous, current]),
    )
    monkeypatch.setattr(
        agent_servicer.DatabaseService,
        "get_messages_by_ids",
        AsyncMock(return_value=[current]),
    )
    captured = {}

    async def invoke(state, config):
        captured["messages"] = list(state["messages"])
        return {**state, "messages": [*state["messages"], AIMessage(content="Hello.")]}

    monkeypatch.setattr(agent_servicer.agent_app, "ainvoke", invoke, raising=False)
    request = agent_pb2.AgentRequest(
        organizationId="synthetic-org",
        conversationId="synthetic-conversation",
        newMessageIds=["new"],
    )
    response = asyncio.run(agent_servicer.SalesAgentServicer().GenerateReply(request, None))
    assert response.replyText == "Hello."
    human_messages = [msg for msg in captured["messages"] if isinstance(msg, HumanMessage)]
    assert len(human_messages) == 2
    assert human_messages[0].content == "Earlier question"
    assert human_messages[1].content == [{"type": "text", "text": "Current question"}]


def test_staff_messages_are_not_patient_messages(monkeypatch):
    # WP-A A5 (KI-049): a staff USER_TEXT is clinic-side context, never a
    # HumanMessage the model could attribute to the patient.
    graph_module = ModuleType("app.modules.agent.graph_builder")
    graph_module.agent_app = SimpleNamespace()
    monkeypatch.setitem(sys.modules, graph_module.__name__, graph_module)
    agent_servicer = importlib.import_module("app.grpc_services.agent_servicer")
    patient_q = SimpleNamespace(id="p1", content="How much is a crown?", type="LEAD_TEXT")
    staff = SimpleNamespace(id="s1", content="The price is 500 EUR", type="USER_TEXT")
    ai = SimpleNamespace(id="a1", content="Anything else?", type="AI_TEXT")
    current = SimpleNamespace(id="new", content="ok", type="LEAD_TEXT", mediaUrl=None)
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_lead_info", AsyncMock(
        return_value=SimpleNamespace(lead_id=None, firstName="Guest", externalContactId="15550000000"),
    ))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_history",
                        AsyncMock(return_value=[patient_q, staff, ai, current]))
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_messages_by_ids", AsyncMock(return_value=[current]))
    captured = {}

    async def invoke(state, config):
        captured["messages"] = list(state["messages"])
        return {**state, "messages": [*state["messages"], AIMessage(content="Thanks.")]}

    monkeypatch.setattr(agent_servicer.agent_app, "ainvoke", invoke, raising=False)
    asyncio.run(agent_servicer.SalesAgentServicer().GenerateReply(agent_pb2.AgentRequest(
        organizationId="synthetic-org", conversationId="synthetic-conversation", newMessageIds=["new"],
    ), None))
    messages = captured["messages"]
    assert [type(m).__name__ for m in messages] == ["HumanMessage", "AIMessage", "AIMessage", "HumanMessage"]
    staff_msg = messages[1]
    assert "The price is 500 EUR" in staff_msg.content
    assert staff_msg.content.startswith("[Clinic staff")
    assert staff_msg.name == "staff"
    assert not any(isinstance(m, HumanMessage) and "500 EUR" in str(m.content) for m in messages)
    assert messages[-1].content == [{"type": "text", "text": "ok"}]
