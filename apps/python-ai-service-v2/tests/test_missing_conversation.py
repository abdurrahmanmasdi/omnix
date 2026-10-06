"""WP-A A8 (KI-054): a missing conversation is a gRPC error, never reply text."""
from unittest.mock import AsyncMock

import grpc
import pytest

import agent_pb2
import agent_pb2_grpc
from app.core.config import settings
from app.grpc_services import agent_servicer
from app.grpc_services.auth_interceptor import AuthInterceptor


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_missing_conversation_returns_not_found_status(monkeypatch):
    monkeypatch.setattr(agent_servicer.DatabaseService, "get_conversation_lead_info", AsyncMock(return_value=None))
    server = grpc.aio.server(interceptors=[AuthInterceptor(settings.INTERNAL_RPC_SECRET)])
    agent_pb2_grpc.add_SalesAgentServicer_to_server(agent_servicer.SalesAgentServicer(), server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()
    try:
        async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = agent_pb2_grpc.SalesAgentStub(channel)
            with pytest.raises(grpc.RpcError) as error:
                await stub.GenerateReply(
                    agent_pb2.AgentRequest(organizationId="org-a8", conversationId="missing", newMessageIds=["m"]),
                    metadata=(("authorization", f"Bearer {settings.INTERNAL_RPC_SECRET}"),),
                )
        assert error.value.code() == grpc.StatusCode.NOT_FOUND
        assert "System error" not in (error.value.details() or "")
    finally:
        await server.stop(None)
