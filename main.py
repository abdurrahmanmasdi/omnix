import os
import asyncio
import grpc
from fastapi import FastAPI
from google import genai
from contextlib import asynccontextmanager
from app.core.database import SessionLocal
from app.modules.rag.document_processor import DocumentService
from app.modules.agent.sales_agent import SalesAgentCoordinator

# Import generated Protobuf files
import agent_pb2
import agent_pb2_grpc
import rag_pb2
import rag_pb2_grpc
import tools_pb2
import tools_pb2_grpc

# Make sure to set your OpenAI API key in your environment variables!
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
client = genai.Client(api_key=OPENAI_API_KEY)


# ---------------------------------------------------------
# 1. THE AI AGENT SERVICER
# ---------------------------------------------------------
class SalesAgentServicer(agent_pb2_grpc.SalesAgentServicer):
    async def GenerateReply(self, request, context):
        # We handle camelCase and snake_case again to be bulletproof
        org_id = getattr(request, 'organizationId', getattr(request, 'organization_id', None))
        conv_id = getattr(request, 'conversationId', getattr(request, 'conversation_id', None))
        latest_msg = getattr(request, 'latestMessage', getattr(request, 'latest_message', None))

        print(f"\n📥 [gRPC] NestJS asked to reply to Conv: {conv_id}")
        print(f"💬 User said: {latest_msg}")
        
        db = SessionLocal()
        try:
            # 🚀 Fire up the Agent!
            agent = SalesAgentCoordinator(db_session=db, api_key=OPENAI_API_KEY)
            reply_text = await agent.process_message(organization_id=org_id, message=latest_msg)
            
            print(f"📤 Sending reply to WhatsApp: {reply_text}\n")
            return agent_pb2.AgentReply(replyText=reply_text)
            
        except Exception as e:
            print(f"❌ Error generating AI reply: {e}")
            fallback_text = "I apologize, but I am experiencing a brief system update. Let me pass you to a human agent."
            return agent_pb2.AgentReply(replyText=fallback_text)
            
        finally:
            db.close()


# ---------------------------------------------------------
# 2. THE RAG DOCUMENT PROCESSOR SERVICER
# ---------------------------------------------------------
class DocumentProcessorServicer(rag_pb2_grpc.DocumentProcessorServicer):
    async def IngestPdf(self, request, context):
        # Bulletproof attribute extraction (handles camelCase or snake_case)
        org_id = getattr(request, 'organizationId', getattr(request, 'organization_id', None))
        doc_id = getattr(request, 'documentationId', getattr(request, 'documentation_id', None))
        file_name = getattr(request, 'fileName', getattr(request, 'file_name', None))
        file_path = getattr(request, 'filePath', getattr(request, 'file_path', None))

        print(f"📥 [gRPC] NestJS asked to ingest PDF: {file_name}")
        
        db = SessionLocal()
        try:
            doc_service = DocumentService(db_session=db, api_key=OPENAI_API_KEY)
            
            chunks = await doc_service.process_and_save_pdf(
                org_id=org_id,
                documentation_id=doc_id,
                file_name=file_name,
                file_path=file_path
            )
            
            return rag_pb2.IngestResponse(success=True, chunksProcessed=chunks)
        except Exception as e:
            print(f"❌ Error processing PDF: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return rag_pb2.IngestResponse(success=False, chunksProcessed=0)
        finally:
            db.close()

    async def DeleteFile(self, request, context):
        print(f"📥 [gRPC] NestJS asked to delete vectors for: {request.fileName}")
        
        db = SessionLocal()
        try:
            doc_service = DocumentService(db_session=db, api_key=OPENAI_API_KEY)
            deleted_count = await doc_service.delete_file_knowledge(
                org_id=request.organizationId,
                file_name=request.fileName
            )
            return rag_pb2.DeleteResponse(success=True, chunksDeleted=deleted_count)
        except Exception as e:
            print(f"❌ Error deleting vectors: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return rag_pb2.DeleteResponse(success=False, chunksDeleted=0)
        finally:
            db.close()


# ---------------------------------------------------------
# 3. FASTAPI LIFECYCLE MANAGEMENT
# ---------------------------------------------------------
_grpc_server = grpc.aio.server()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register the Sales Agent
    agent_pb2_grpc.add_SalesAgentServicer_to_server(SalesAgentServicer(), _grpc_server)
    
    # 🚀 Register the Document Processor!
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