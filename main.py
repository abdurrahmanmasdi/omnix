import os
import asyncio
import grpc
from fastapi import FastAPI
from google import genai
from contextlib import asynccontextmanager
from app.core.database import SessionLocal
from app.modules.rag.document_processor import DocumentService
from app.modules.agent.graph import agent_app
from sqlalchemy import text
from langchain_core.messages import HumanMessage, AIMessage
from app.core.config import settings
from app.modules.rag.experience_processor import ExperienceProcessor

# Import generated Protobuf files
import agent_pb2
import agent_pb2_grpc
import rag_pb2
import rag_pb2_grpc
import tools_pb2
import tools_pb2_grpc

# Make sure to set your Gemini API key in your environment variables!
GEMINI_API_KEY = settings.Gemini_API_KEY
client = genai.Client(api_key=GEMINI_API_KEY)


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
            # 1. Fetch Lead Info & Status from the database (Using raw SQL to read Prisma tables safely)
            # Assuming your conversations table has a leadId linking to the leads table
            lead_query = text("""
                SELECT l.id, l."firstName", l.country, l.status, l.priority 
                FROM leads l 
                JOIN conversations c ON c."leadId" = l.id 
                WHERE c.id = :conv_id
            """)
            lead_result = db.execute(lead_query, {"conv_id": conv_id}).fetchone()
            
            # Default state if lead doesn't exist yet
            state_data = {
                "organization_id": org_id,
                "conversation_id": conv_id,
                "lead_id": str(lead_result.id) if lead_result else None,
                "first_name": lead_result.firstName if lead_result else "Unknown",
                "country": lead_result.country if lead_result else "Unknown",
                "lead_status": lead_result.status if lead_result else "NEW",
                "lead_priority": lead_result.priority if lead_result else "COLD",
                "messages": []
            }

            # 2. Fetch the last 6 messages for short-term memory
            msg_query = text("""
                SELECT content, type 
                FROM messages 
                WHERE "conversationId" = :conv_id 
                ORDER BY "createdAt" ASC 
                LIMIT 6
            """)
            history = db.execute(msg_query, {"conv_id": conv_id}).fetchall()
            
            for msg in history:
                if msg.type in ['USER_TEXT', 'LEAD_TEXT']:
                    state_data["messages"].append(HumanMessage(content=msg.content))
                elif msg.type == 'AI_TEXT':
                    state_data["messages"].append(AIMessage(content=msg.content))
            
            # 3. Add the brand new message from WhatsApp
            state_data["messages"].append(HumanMessage(content=latest_msg))

            # 4. 🚀 RUN THE LANGGRAPH AGENT
            # Ainvoke streams the state through the graph until it hits the END node
            final_state = await agent_app.ainvoke(state_data)
            
            # The last message in the state is the AI's final WhatsApp reply
            ai_reply = final_state["messages"][-1].content
            
            print(f"📤 Sending reply to WhatsApp: {ai_reply}\n")
            return agent_pb2.AgentReply(replyText=ai_reply)
            
        except Exception as e:
            print(f"❌ Error generating AI reply: {e}")
            return agent_pb2.AgentReply(replyText="I apologize, but I am experiencing a brief system update. Let me pass you to a human agent.")
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
            doc_service = DocumentService(db_session=db, gemini_api_key=GEMINI_API_KEY)
            
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

    async def EmbedExperience(self, request, context):
        processor = ExperienceProcessor()
        success = await processor.embed_and_save_experience(
            experience_id=request.experience_id,
            org_id=request.organization_id
        )
        
        if success:
            return rag_pb2.EmbedExperienceResponse(
                success=True, 
                message="Vector generated and saved successfully."
            )
        else:
            return rag_pb2.EmbedExperienceResponse(
                success=False, 
                message="Failed to generate vector."
            )

    async def DeleteFile(self, request, context):
        print(f"📥 [gRPC] NestJS asked to delete vectors for: {request.fileName}")
        
        db = SessionLocal()
        try:
            doc_service = DocumentService(db_session=db, gemini_api_key=GEMINI_API_KEY)
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