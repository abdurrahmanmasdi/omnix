import grpc
from fastapi import FastAPI
from contextlib import asynccontextmanager

# Import generated Protobuf files
import agent_pb2_grpc
import rag_pb2_grpc

# Import our modular servicers
from app.grpc_services.agent_servicer import SalesAgentServicer
from app.grpc_services.document_servicer import DocumentProcessorServicer

_grpc_server = grpc.aio.server()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register the Sales Agent
    agent_pb2_grpc.add_SalesAgentServicer_to_server(SalesAgentServicer(), _grpc_server)
    
    # Register the Document Processor
    rag_pb2_grpc.add_DocumentProcessorServicer_to_server(DocumentProcessorServicer(), _grpc_server)
    
    _grpc_server.add_insecure_port('[::]:50051')
    await _grpc_server.start()
    print("🚀 gRPC Server running seamlessly on port 50051")
    
    yield
    
    print("🛑 Shutting down gRPC Server...")
    await _grpc_server.stop(0)

app = FastAPI(lifespan=lifespan, title="AI Sales Agent API")

@app.get("/health")
async def health_check():
    return {"status": "ok"}