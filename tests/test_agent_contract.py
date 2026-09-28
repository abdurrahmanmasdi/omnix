import json
from pathlib import Path

from app.modules.agent.actions import CONTRACT_VERSION, parse_virtual_action


def test_golden_agent_actions():
    fixtures = json.loads(Path(__file__).with_name("agent-actions.v1.fixtures.json").read_text())
    assert CONTRACT_VERSION == 1
    for action in fixtures["valid"]:
        assert parse_virtual_action({"action": action["type"], "payload": action["payload"]}) is not None
    for action in fixtures["invalid"]:
        assert parse_virtual_action({"action": action["type"], "payload": action["payload"]}) is None


def test_wire_version_rejection():
    from app.grpc_services.agent_servicer import SalesAgentServicer
    from agent_pb2 import AgentRequest
    import asyncio

    response = asyncio.run(SalesAgentServicer().GenerateReply(AgentRequest(contractVersion=2), None))
    assert response.contractVersion == 1
    assert response.actions[0].type == "HANDOFF_TO_HUMAN"
