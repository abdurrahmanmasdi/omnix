import logging
import grpc
from fastapi import FastAPI
from contextlib import asynccontextmanager

# ─── CONFIGURE STRUCTURED LOGGING ────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Import generated Protobuf files
import agent_pb2_grpc
import rag_pb2_grpc

# Import our modular servicers
from app.grpc_services.agent_servicer import SalesAgentServicer
from app.grpc_services.document_servicer import DocumentProcessorServicer

from app.grpc_services.auth_interceptor import AuthInterceptor
from app.core.config import settings

_grpc_server = grpc.aio.server(interceptors=[AuthInterceptor(settings.INTERNAL_RPC_SECRET)])

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register the Sales Agent
    agent_pb2_grpc.add_SalesAgentServicer_to_server(SalesAgentServicer(), _grpc_server)
    
    # Register the Document Processor
    rag_pb2_grpc.add_DocumentProcessorServicer_to_server(DocumentProcessorServicer(), _grpc_server)
    
    if settings.ENVIRONMENT == "production":
        # Note: server certificates should be loaded appropriately in production
        # This is a placeholder for the explicit production transport
        server_credentials = grpc.ssl_server_credentials([])
        _grpc_server.add_secure_port(f'[::]:{settings.GRPC_PORT}', server_credentials)
    else:
        _grpc_server.add_insecure_port(f'[::]:{settings.GRPC_PORT}')
    await _grpc_server.start()
    logger.info("gRPC Server running on port %d", settings.GRPC_PORT)
    
    yield
    
    logger.info("Shutting down gRPC Server...")
    await _grpc_server.stop(0)

app = FastAPI(lifespan=lifespan, title="AI Sales Agent API")

@app.get("/health")
async def health_check():
    return {"status": "ok"}