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

# Make sure to set your OPENAI API key in your environment variables!
API_KEY = settings.OPENAI_API_KEY
client = genai.Client(api_key=API_KEY)


# ---------------------------------------------------------
# 1. THE AI AGENT SERVICER
# ---------------------------------------------------------
class SalesAgentServicer(agent_pb2_grpc.SalesAgentServicer):
    async def GenerateReply(self, request, context):
        # We handle camelCase and snake_case again to be bulletproof
        org_id = getattr(request, 'organizationId', getattr(request, 'organization_id', None))
        conv_id = getattr(request, 'conversationId', getattr(request, 'conversation_id', None))
        latest_msg = getattr(request, 'latestMessage', getattr(request, 'latest_message', None))
        
        # New Dynamic AI config properties
        clinic_name = getattr(request, 'clinicName', getattr(request, 'clinic_name', 'our clinic'))
        agent_tone = getattr(request, 'agentTone', getattr(request, 'agent_tone', 'Professional and empathetic'))
        business_rules = getattr(request, 'businessRulesJson', getattr(request, 'business_rules_json', '{}'))

        print(f"\n📥 [gRPC] NestJS asked to reply to Conv: {conv_id}")
        print(f"💬 User said: {latest_msg}")
        
        db = SessionLocal()
        try:
            # 1. Fetch Lead Info & Status from the database
            # We use a LEFT JOIN to ensure we get the conversation even if the leadId is currently NULL
            lead_query = text("""
                SELECT c.id as conv_id, l.id as lead_id, l."firstName", l."lastName", l.gender, l.country, l.status, l.priority, c."externalContactId"
                FROM conversations c
                LEFT JOIN leads l ON c."leadId" = l.id 
                WHERE c.id = :conv_id
            """)
            res = db.execute(lead_query, {"conv_id": conv_id}).fetchone()
            
            if not res:
                print(f"⚠️ [gRPC] Conversation {conv_id} not found in DB!")
                return agent_pb2.AgentReply(replyText="System error: Conversation not found.")

            # Default state if lead doesn't exist yet
            state_data = {
                "organization_id": org_id,
                "conversation_id": conv_id,
                "lead_id": str(res.lead_id) if res.lead_id else None,
                "first_name": res.firstName if res.lead_id else "Guest",
                "last_name": res.lastName if res.lead_id else None,
                "phone_number": res.externalContactId,
                "gender": res.gender if res.lead_id else "UNKNOWN",
                "country": res.country if res.lead_id else "Unknown",
                "lead_status": res.status if res.lead_id else "NEW",
                "lead_priority": res.priority if res.lead_id else "COLD",
                "clinic_name": clinic_name,
                "agent_tone": agent_tone,
                "business_rules": business_rules,
                "messages": []
            }

            print(f"🔍 [State] Lead: {state_data['first_name']} | Status: {state_data['lead_status']} | ID: {state_data['lead_id']}")

            # 2. Fetch the last 120 messages for short-term memory
            msg_query = text("""
                SELECT content, type 
                FROM messages 
                WHERE "conversationId" = :conv_id 
                ORDER BY "createdAt" ASC 
                LIMIT 120
            """)
            history = db.execute(msg_query, {"conv_id": conv_id}).fetchall()
            
            for msg in history:
                if msg.type in ['USER_TEXT', 'LEAD_TEXT']:
                    state_data["messages"].append(HumanMessage(content=msg.content))
                elif msg.type == 'AI_TEXT':
                    state_data["messages"].append(AIMessage(content=msg.content))
            
            # 3. Add the brand new message from WhatsApp (Unless it's the debouncing signal)
            if latest_msg and not latest_msg.startswith("[User finished typing"):
                state_data["messages"].append(HumanMessage(content=latest_msg))

            # 4. 🚀 RUN THE LANGGRAPH AGENT
            # We pass the organization_id in the 'configurable' config so tools can access it 
            # without the LLM needing to manage it. This is the "Full Pattern" approach.
            config = {"configurable": {"organization_id": org_id}}
            final_state = await agent_app.ainvoke(state_data, config=config)
            
            # 5. Extract Final Content & Media
            ai_reply_msg = final_state["messages"][-1]
            ai_reply_text = ai_reply_msg.content
            
            # 🚀 SPLIT MESSAGES for "Human-like" feel
            # We look for the "PART_SPLIT" token we added to the prompt
            reply_parts = [p.strip() for p in ai_reply_text.split("|||") if p.strip()]
            
            # Detect Media Links in the reply
            media_url = ""
            if "Photos:" in ai_reply_text:
                import re
                urls = re.findall(r'(https?://\S+)', ai_reply_text)
                if urls:
                    media_url = urls[0]
            
            # 6. Extract "Virtual" Tool Actions for NestJS
            tool_actions = []
            for msg in final_state["messages"]:
                if hasattr(msg, "content") and "TOOL_ACTION:" in msg.content:
                    try:
                        parts = msg.content.split(":", 2)
                        if len(parts) == 3:
                            tool_actions.append(agent_pb2.ToolAction(
                                type=parts[1],
                                payload=parts[2]
                            ))
                    except Exception as te:
                        print(f"⚠️ Error parsing virtual tool: {te}")

            # Note: Since the gRPC proto AgentReply usually takes a single string, 
            # we join them with a unique separator that the NestJS backend can split on.
            # I recommend adding a "messages" repeated field to the proto later.
            # For now, we join with \n\n|||\n\n
            final_reply_to_send = "\n\n|||\n\n".join(reply_parts)

            print(f"📤 Sending {len(reply_parts)} messages to WhatsApp.")
            
            return agent_pb2.AgentReply(
                replyText=final_reply_to_send,
                mediaUrl=media_url,
                actions=tool_actions
            )
            
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
            doc_service = DocumentService(db_session=db, api_key=API_KEY)
            
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
            doc_service = DocumentService(db_session=db, api_key=API_KEY)
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