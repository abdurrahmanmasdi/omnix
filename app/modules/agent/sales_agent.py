from sqlalchemy.orm import Session
from app.modules.rag.retriever import RAGRetriever
from app.modules.llm.generator import LLMService
from app.modules.safety.guardrails import SafetyService
from .router import IntentRouter


class SalesAgentCoordinator:
    def __init__(self, db_session: Session, api_key: str):
        # Dependency Injection: Instantiate the tools
        self.rag = RAGRetriever(db_session=db_session, api_key=api_key)
        self.llm = LLMService(api_key=api_key)
        self.safety = SafetyService()
        self.router = IntentRouter(api_key=api_key)

    async def process_message(self, organization_id: str, message: str) -> str:

        needs_search = await self.router.requires_knowledge_search(message)

        if needs_search:
            print("🚦 Router: SEARCH REQUIRED. Hitting pgvector...")
            # Step 1: Retrieve context (RAG)
            context = await self.rag.get_relevant_context(organization_id, message)
        else:
            print("🚦 Router: CHITCHAT DETECTED. Bypassing database...")
            context = "No context needed. This is conversational. Be polite and ask how you can help with their medical needs."
            
        
        # Step 2: Generate Initial Response
        draft_reply = await self.llm.generate_response(message, context)
        
        # # Step 3: Safety Check
        # is_safe = await self.safety.verify_no_hallucinations(draft_reply, context)
        
        # # Step 4: Final Output
        # if not is_safe:
        #     print("⚠️ Hallucination detected! Falling back to safe response.")
        #     return "I need to double-check that with our medical team. Can I get back to you?"
            
        return draft_reply