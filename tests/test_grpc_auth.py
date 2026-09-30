import pytest
import grpc
import asyncio
from app.core.config import settings
from app.grpc_services.auth_interceptor import AuthInterceptor
import agent_pb2, agent_pb2_grpc
import rag_pb2, rag_pb2_grpc
from app.grpc_services.agent_servicer import SalesAgentServicer
from app.grpc_services.document_servicer import DocumentProcessorServicer

@pytest.fixture
def anyio_backend():
    return 'asyncio'

@pytest.fixture
async def grpc_server():
    server = grpc.aio.server(interceptors=[AuthInterceptor(settings.INTERNAL_RPC_SECRET)])
    agent_pb2_grpc.add_SalesAgentServicer_to_server(SalesAgentServicer(), server)
    rag_pb2_grpc.add_DocumentProcessorServicer_to_server(DocumentProcessorServicer(), server)
    port = server.add_insecure_port('127.0.0.1:0')
    await server.start()
    yield f"127.0.0.1:{port}"
    await server.stop(None)

@pytest.mark.anyio
async def test_grpc_auth_missing_token(grpc_server):
    async with grpc.aio.insecure_channel(grpc_server) as channel:
        stub = agent_pb2_grpc.SalesAgentStub(channel)
        req = agent_pb2.AgentRequest(organizationId="test", conversationId="test")
        try:
            await stub.GenerateReply(req)
            assert False, "Should have failed"
        except grpc.RpcError as exc:
            assert exc.code() == grpc.StatusCode.UNAUTHENTICATED

@pytest.mark.anyio
async def test_grpc_auth_invalid_token(grpc_server):
    async with grpc.aio.insecure_channel(grpc_server) as channel:
        stub = agent_pb2_grpc.SalesAgentStub(channel)
        req = agent_pb2.AgentRequest(organizationId="test", conversationId="test")
        try:
            await stub.GenerateReply(req, metadata=(('authorization', 'Bearer invalid'),))
            assert False, "Should have failed"
        except grpc.RpcError as exc:
            assert exc.code() == grpc.StatusCode.UNAUTHENTICATED

@pytest.mark.anyio
async def test_grpc_auth_valid_token(grpc_server):
    async with grpc.aio.insecure_channel(grpc_server) as channel:
        stub = agent_pb2_grpc.SalesAgentStub(channel)
        req = agent_pb2.AgentRequest(organizationId="test", conversationId="test")
        try:
            await stub.GenerateReply(req, metadata=(('authorization', f'Bearer {settings.INTERNAL_RPC_SECRET}'),))
            # It will probably fail with UNIMPLEMENTED or something else if not mocked, but NOT UNAUTHENTICATED
        except grpc.RpcError as exc:
            assert exc.code() != grpc.StatusCode.UNAUTHENTICATED
