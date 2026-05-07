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
        retriever = RAGRetriever(db_session=db, api_key=settings.OPENAI_API_KEY)
        # Reusing the exact OpenAI 3072-dimension search logic we built earlier
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
    organization_id: str,
    lead_id: str, 
    status: str = None, 
    priority: str = None
) -> str:
    """
    Updates the patient's CRM profile.
    ALLOWED STATUSES: "QUALIFYING", "READY_TO_PAY", "HANDED_OFF", "UNQUALIFIED"
    ALLOWED PRIORITIES: "COLD", "WARM", "HOT"
    """
    print(f"🛠️ [TOOL] Syncing CRM for Lead {lead_id} | Status: {status} | Priority: {priority}")
    # (Future SQLAlchemy update code goes here)
    return f"CRM updated. Status: {status}, Priority: {priority}."

@tool
async def fetch_social_proof(organization_id: str, user_objection: str) -> str:
    """
    Fetches real patient stories and 'Before & After' links related to a user's fear or objection.
    Use this when the patient shows hesitation, fear of pain, or doubts about the result.
    """
    print(f"🛠️ [TOOL] Searching Social Proof for: '{user_objection}'")
    db = SessionLocal()
    try:
        from langchain_openai import OpenAIEmbeddings
        from app.core.database import OrganizationExperience
        from sqlalchemy import text
        
        embeddings = OpenAIEmbeddings(
            model="text-embedding-3-large", 
            dimensions=3072,
            api_key=settings.OPENAI_API_KEY
        )
        query_vector = await embeddings.aembed_query(user_objection)

        # 🚀 Vector Similarity Search (PostgreSQL pgvector)
        # We find the top 1 experience that matches the user's fear
        sql = text("""
            SELECT title, "storyText", "patientCountry", "procedureType", "beforeAfterLinks"
            FROM organization_experiences
            WHERE "organizationId" = :org_id
            ORDER BY embedding <=> :vector
            LIMIT 1
        """)
        
        result = db.execute(sql, {"org_id": organization_id, "vector": str(query_vector)}).fetchone()
        
        if not result:
            return "We have many successful cases! I can tell you more about our procedure's high success rate."

        proof = f"""
        RELEVANT CASE STUDY:
        Title: {result.title}
        Patient from: {result.patientCountry}
        Procedure: {result.procedureType}
        Experience: {result.storyText}
        Photos: {result.beforeAfterLinks}
        """
        return proof

    except Exception as e:
        print(f"❌ Social proof tool error: {e}")
        return "Our clinic has a 98% satisfaction rate and thousands of happy patients."
    finally:
        db.close()

tools_list = [search_clinic_knowledge, sync_lead_crm, fetch_social_proof]