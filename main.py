import asyncio
import logging
import grpc
from fastapi import FastAPI, Response
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
from app.core.grpc_transport import server_credentials
from app.infrastructure.database_service import DatabaseService

_grpc_server = grpc.aio.server(interceptors=[AuthInterceptor(settings.INTERNAL_RPC_SECRET)])
# Set once the gRPC listener has started; reported by /health.
_grpc_ready = False
HEALTH_CHECK_TIMEOUT_SECONDS = 2

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register the Sales Agent
    agent_pb2_grpc.add_SalesAgentServicer_to_server(SalesAgentServicer(), _grpc_server)
    
    # Register the Document Processor
    rag_pb2_grpc.add_DocumentProcessorServicer_to_server(DocumentProcessorServicer(), _grpc_server)
    
    # INTERNAL_GRPC_TLS decides (not ENVIRONMENT); misconfiguration stops startup.
    credentials = server_credentials(settings)
    if credentials is None:
        _grpc_server.add_insecure_port(f'[::]:{settings.GRPC_PORT}')
    else:
        _grpc_server.add_secure_port(f'[::]:{settings.GRPC_PORT}', credentials)
    await _grpc_server.start()
    global _grpc_ready
    _grpc_ready = True
    logger.info("gRPC Server running on port %d", settings.GRPC_PORT)
    
    yield
    
    _grpc_ready = False
    logger.info("Shutting down gRPC Server...")
    await _grpc_server.stop(0)

app = FastAPI(lifespan=lifespan, title="AI Sales Agent API")

@app.get("/health")
async def health_check(response: Response):
    """Readiness: database reachable and gRPC listener started (KI-033). Names only, no error details."""
    try:
        await asyncio.wait_for(DatabaseService.ping(), timeout=HEALTH_CHECK_TIMEOUT_SECONDS)
        database = "ok"
    except Exception:
        logger.warning("HEALTH_CHECK_FAILED check=database")
        database = "failed"
    checks = {"database": database, "grpc": "ok" if _grpc_ready else "failed"}
    ready = all(state == "ok" for state in checks.values())
    response.status_code = 200 if ready else 503
    return {"status": "ok" if ready else "not_ready", "checks": checks}