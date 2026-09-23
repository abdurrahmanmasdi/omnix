import json
import logging

from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from langchain_openai import OpenAIEmbeddings
from sqlalchemy import text

from app.core.database import SessionLocal
from app.modules.rag.retriever import RAGRetriever
from app.core.config import settings
from app.infrastructure.llm_factory import EMBEDDING_MODEL, EMBEDDING_DIMENSIONS

logger = logging.getLogger(__name__)


# 🚀 Tool 1: The RAG Database Search
@tool
async def search_clinic_knowledge(search_query: str, config: RunnableConfig) -> str:
    """
    Searches the clinic's PDF database for prices, medical procedures, or rules.
    Use this WHENEVER the patient asks a specific question about the clinic's services.
    """
    org_id = config["configurable"].get("organization_id")
    logger.info("[TOOL] Searching Knowledge Base for: '%s' (Org: %s)", search_query, org_id)
    db = SessionLocal()
    try:
        retriever = RAGRetriever(db_session=db, api_key=settings.OPENAI_API_KEY)
        context = await retriever.get_relevant_context(org_id, search_query)
        return context
    except Exception as e:
        logger.error("Knowledge base search error: %s", e)
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
    logger.info("[VIRTUAL TOOL] Lead Creation (redacted)")
    return json.dumps({
        "action": "CREATE_LEAD",
        "payload": payload
    })

@tool
async def fetch_social_proof(user_objection: str, config: RunnableConfig) -> str:
    """
    Fetches real patient stories and 'Before & After' links related to a user's fear or objection.
    Use this when the patient shows hesitation, fear of pain, or doubts about the result.
    """
    org_id = config["configurable"].get("organization_id")
    logger.info("[TOOL] Searching Social Proof for: '%s' (Org: %s)", user_objection, org_id)
    db = SessionLocal()
    try:
        embeddings = OpenAIEmbeddings(
            model=EMBEDDING_MODEL, 
            dimensions=EMBEDDING_DIMENSIONS,
            api_key=settings.OPENAI_API_KEY
        )
        query_vector = await embeddings.aembed_query(user_objection)

        sql = text("""
            SELECT title, "storyText", "patientCountry", "procedureType", "beforeImageUrl", "afterImageUrl"
            FROM organization_experiences
            WHERE "organizationId" = :org_id AND "consentObtained" = true
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
        logger.error("Social proof tool error: %s", e)
        return "Our clinic has a 98% satisfaction rate and thousands of happy patients."
    finally:
        db.close()

@tool
async def fetch_battlecard(user_objection: str, config: RunnableConfig) -> str:
    """
    Fetches real competitor battlecards and approved rebuttals when the patient mentions a competitor or specific objection.
    Use this when the patient compares us to another clinic (e.g. 'Clinic X is cheaper' or 'Why are you more expensive?').
    """
    org_id = config["configurable"].get("organization_id")
    logger.info("[TOOL] Searching Battlecards for: '%s' (Org: %s)", user_objection, org_id)
    db = SessionLocal()
    try:
        embeddings = OpenAIEmbeddings(
            model=EMBEDDING_MODEL, 
            dimensions=EMBEDDING_DIMENSIONS,
            api_key=settings.OPENAI_API_KEY
        )
        query_vector = await embeddings.aembed_query(user_objection)

        sql = text("""
            SELECT "competitorName", "objectionType", "rebuttalText"
            FROM organization_battlecards
            WHERE "organizationId" = :org_id AND "consentObtained" = true
              AND embedding IS NOT NULL
            ORDER BY embedding <=> :vector
            LIMIT 1
        """)
        
        result = db.execute(sql, {"org_id": org_id, "vector": str(query_vector)}).fetchone()
        
        if not result:
            return "Our clinic provides premium quality and guaranteed results that set us apart from standard options."

        proof = f"""
        COMPETITOR BATTLECARD FOUND:
        Competitor / Context: {result.competitorName}
        Objection Type: {result.objectionType}
        Suggested Rebuttal: {result.rebuttalText}
        """
        return proof

    except Exception as e:
        logger.error("Battlecard tool error: %s", e)
        return "We focus on premium care and long-term results rather than competing purely on price."
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

    logger.info("[TOOL] Escalating Conv: %s to Human. Reason: %s", conv_id, reason)

    db = SessionLocal()
    try:
        # READ-ONLY: Fetch Lead context and the assigned human agent
        query = text("""
            SELECT l.id, l."assignedAgentId", l."firstName"
            FROM conversations c
            LEFT JOIN leads l ON c."leadId" = l.id
            WHERE c.id = :conv_id AND c."organizationId" = :org_id
        """)
        result = db.execute(query, {"conv_id": conv_id, "org_id": org_id}).fetchone()

        if not result or not result[0]:
            return "Error: Could not find associated lead to escalate."

        lead_id = str(result[0])
        agent_id = str(result[1]) if result[1] else None
        first_name = result[2] or "Patient"

        # Build virtual action for NestJS to execute
        action = {
            "action": "HANDOFF_TO_HUMAN",
            "payload": {
                "lead_id": lead_id,
                "reason": reason
            }
        }
        return json.dumps(action)

    except Exception as e:
        logger.error("Escalation error: %s", e)
        return "Failed to escalate."
    finally:
        db.close()

@tool
async def update_patient_profile(
    first_name: str = None,
    gender: str = None,
    country: str = None,
    service_interested: str = None,
) -> str:
    """
    Updates the patient's CRM profile with newly discovered demographic or preference info.
    Use this silently when the user reveals their name, location, or you deduce their gender.
    Returns a virtual action string for NestJS to execute.
    """
    data = {}
    
    if first_name:
        data["firstName"] = first_name
    if gender and gender.upper() in ["MALE", "FEMALE"]:
        data["gender"] = gender.upper()
    if country:
        data["country"] = country
    if service_interested:
        data["serviceInterested"] = service_interested
        
    if data:
        logger.info("[VIRTUAL TOOL] Update Patient Profile (redacted)")
        return json.dumps({
            "action": "UPDATE_LEAD",
            "payload": data
        })
    
    return "No valid CRM fields provided to update."

@tool
async def schedule_follow_up(
    scheduled_at: str,
    context: str = "General follow-up",
) -> str:
    """
    Schedules a follow-up message at a specific date and time.
    Use this when the customer says things like "call me tomorrow",
    "let me think about it", or agrees to a specific callback time.
    
    Args:
        scheduled_at: ISO 8601 datetime string (e.g., "2026-09-18T17:00:00+03:00")
        context: Brief note about what to follow up about
    """
    payload = {
        "scheduledAt": scheduled_at,
        "context": context,
    }
    logger.info("[VIRTUAL TOOL] Schedule Follow Up: %s at %s", context, scheduled_at)
    return json.dumps({
        "action": "SCHEDULE_FOLLOW_UP",
        "payload": payload
    })

tools_list = [search_clinic_knowledge, fetch_social_proof, fetch_battlecard, create_lead, escalate_to_human, update_patient_profile, schedule_follow_up]