from langchain_core.tools import tool
from app.core.database import SessionLocal
from app.modules.rag.retriever import RAGRetriever
from app.core.config import settings

# 🚀 Tool 1: The RAG Database Search
@tool
async def search_clinic_knowledge(organization_id: str, search_query: str) -> str:
    """
    Searches the clinic's PDF database for prices, medical procedures, or rules.
    Use this WHENEVER the patient asks a specific question about the clinic's services.
    """
    print(f"🛠️ [TOOL] Searching Knowledge Base for: '{search_query}'")
    db = SessionLocal()
    try:
        retriever = RAGRetriever(db_session=db, gemini_api_key=settings.Gemini_API_KEY)
        # Reusing the exact Gemini 768-dimension search logic we built earlier
        context = await retriever.get_relevant_context(organization_id, search_query)
        return context
    except Exception as e:
        print(f"❌ Database search error: {e}")
        return "I'm sorry, I couldn't access the clinic records at this moment."
    finally:
        db.close()

# 🚀 Tool 2: Full Lead Profile Sync
@tool
async def sync_lead_crm(
    lead_id: str, 
    first_name: str = None, 
    country: str = None, 
    status: str = None, 
    priority: str = None
) -> str:
    """
    Updates the patient's CRM profile in the database.
    - status options: "QUALIFYING" (asking questions), "READY_TO_PAY" (wants to buy), "HANDED_OFF" (needs human doctor).
    - priority options: "COLD", "WARM", "HOT".
    """
    print(f"🛠️ [TOOL] Syncing CRM for Lead {lead_id} | Status: {status} | Priority: {priority}")
    
    # TODO: Later, we will write the SQLAlchemy update here to change the Prisma Lead table.
    
    return f"Successfully updated CRM. Status is {status}, Priority is {priority}."

tools_list = [search_clinic_knowledge, sync_lead_crm]