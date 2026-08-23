from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from app.core.database import SessionLocal
from app.modules.rag.retriever import RAGRetriever
from app.core.config import settings
from langchain_openai import OpenAIEmbeddings
from sqlalchemy import text
import json

# 🚀 Tool 1: The RAG Database Search
@tool
async def search_clinic_knowledge(search_query: str, config: RunnableConfig) -> str:
    """
    Searches the clinic's PDF database for prices, medical procedures, or rules.
    Use this WHENEVER the patient asks a specific question about the clinic's services.
    """
    org_id = config["configurable"].get("organization_id")
    print(f"🛠️ [TOOL] Searching Knowledge Base for: '{search_query}' (Org: {org_id})")
    db = SessionLocal()
    try:
        retriever = RAGRetriever(db_session=db, api_key=settings.OPENAI_API_KEY)
        context = await retriever.get_relevant_context(org_id, search_query)
        return context
    except Exception as e:
        print(f"❌ Database search error: {e}")
        return "I'm sorry, I couldn't access the clinic records at this moment."
    finally:
        db.close()

# 🚀 Tool 2: Virtual CRM Sync (Instructions for NestJS)
@tool
async def create_lead(
    first_name: str,
    last_name: str = None,
    phone_number: str = None,
    gender: str = None,
    country: str = None,
    timezone: str = None,
    currency: str = "USD",
    preferred_language: str = None,
    primary_language: str = None,
    social_links: dict = None
) -> str:
    """
    Creates a new patient profile in the CRM with full enrichment.
    Use this ONLY when 'lead_id' is missing and you have gathered the name.
    """
    data = {
        "firstName": first_name,
        "lastName": last_name,
        "phoneNumber": phone_number,
        "gender": gender,
        "country": country,
        "timezone": timezone,
        "currency": currency,
        "preferredLanguage": preferred_language,
        "primaryLanguage": primary_language,
        "socialLinks": social_links or {"whatsapp": phone_number},
        "status": "NEW",
        "pipelineStageId": "INQUIRY", # Fixed field name
        "priority": "COLD"
    }
    payload = {k: v for k, v in data.items() if v is not None}
    print(f"🛠️ [VIRTUAL TOOL] Comprehensive Lead Creation: {payload}")
    return f"TOOL_ACTION:CREATE_LEAD:{json.dumps(payload)}"

@tool
async def fetch_social_proof(user_objection: str, config: RunnableConfig) -> str:
    """
    Fetches real patient stories and 'Before & After' links related to a user's fear or objection.
    Use this when the patient shows hesitation, fear of pain, or doubts about the result.
    """
    org_id = config["configurable"].get("organization_id")
    print(f"🛠️ [TOOL] Searching Social Proof for: '{user_objection}' (Org: {org_id})")
    db = SessionLocal()
    try:
        embeddings = OpenAIEmbeddings(
            model="text-embedding-3-large", 
            dimensions=3072,
            api_key=settings.OPENAI_API_KEY
        )
        query_vector = await embeddings.aembed_query(user_objection)

        # 🚀 FIX: Query the exact columns defined in Prisma
        sql = text("""
            SELECT title, "storyText", "patientCountry", "procedureType", "beforeImageUrl", "afterImageUrl"
            FROM organization_experiences
            WHERE "organizationId" = :org_id
            ORDER BY embedding <=> :vector
            LIMIT 1
        """)
        
        result = db.execute(sql, {"org_id": org_id, "vector": str(query_vector)}).fetchone()
        
        if not result:
            return "We have many successful cases! I can tell you more about our procedure's high success rate."

        # Safely format the image URLs if they exist in the DB
        photos_str = ""
        if result.beforeImageUrl:
            photos_str += f"Before: {result.beforeImageUrl} "
        if result.afterImageUrl:
            photos_str += f"After: {result.afterImageUrl}"

        proof = f"""
        RELEVANT CASE STUDY:
        Title: {result.title}
        Patient from: {result.patientCountry}
        Procedure: {result.procedureType}
        Experience: {result.storyText}
        Photos: {photos_str if photos_str else "No photos available for this specific case."}
        """
        return proof

    except Exception as e:
        print(f"❌ Social proof tool error: {e}")
        return "Our clinic has a 98% satisfaction rate and thousands of happy patients."
    finally:
        db.close()

@tool
async def escalate_to_human(reason: str, config: RunnableConfig) -> str:
    """
    Escalates the conversation to a human agent.
    Use this ONLY when the patient explicitly asks for a human, is extremely frustrated,
    is ready to make a payment and needs human assistance, or reports a post-op medical issue.

    IMPORTANT: This tool does NOT modify the database. It returns virtual actions
    for the NestJS orchestrator to execute (Separation of Concerns).
    """
    org_id = config["configurable"].get("organization_id")
    conv_id = config["configurable"].get("conversation_id")

    print(f"🛠️ [TOOL] Escalating Conv: {conv_id} to Human. Reason: {reason}")

    db = SessionLocal()
    try:
        # READ-ONLY: Fetch Lead context and the assigned human agent
        query = text("""
            SELECT l.id, l."assignedAgentId", l."firstName"
            FROM conversations c
            LEFT JOIN leads l ON c."leadId" = l.id
            WHERE c.id = :conv_id
        """)
        result = db.execute(query, {"conv_id": conv_id}).fetchone()

        if not result or not result[0]:
            return "Error: Could not find associated lead to escalate."

        lead_id = str(result[0])
        agent_id = str(result[1]) if result[1] else None
        first_name = result[2] or "Patient"

        # Build virtual actions for NestJS to execute
        actions = []

        # Action 1: Mark the lead as HANDED_OFF
        actions.append(f"TOOL_ACTION:UPDATE_LEAD:{json.dumps({'leadId': lead_id, 'status': 'HANDED_OFF'})}")

        # Action 2: Pause the AI on this conversation
        actions.append(f"TOOL_ACTION:PAUSE_CONVERSATION:{json.dumps({'conversationId': conv_id})}")

        # Action 3: Notify the assigned human agent (if one exists)
        if agent_id:
            notify_payload = {
                "userId": agent_id,
                "title": f"Handoff Required: {first_name}",
                "body": reason,
                "referenceId": lead_id,
                "referenceType": "LEAD"
            }
            actions.append(f"TOOL_ACTION:NOTIFY_AGENT:{json.dumps(notify_payload)}")

        print(f"📤 [VIRTUAL] Returning {len(actions)} actions for NestJS to execute.")
        return "\n\n|||\n\n".join(actions)

    except Exception as e:
        print(f"❌ Escalation error: {e}")
        return "Failed to escalate."
    finally:
        db.close()

tools_list = [search_clinic_knowledge, fetch_social_proof, create_lead, escalate_to_human]