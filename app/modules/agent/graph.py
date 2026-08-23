import os
import re
from typing import Literal, TypedDict, Annotated, Sequence
from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, BaseMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
import operator
from app.modules.agent.state import AgentState

from app.modules.agent.tools import (
    tools_list,
    search_clinic_knowledge,
    fetch_social_proof,
    create_lead,
    escalate_to_human,
    update_patient_profile,
)
from app.core.config import settings

# ---------------------------------------------------------
# 🧠 STATE DEFINITION (Make sure this is in your state.py)
# ---------------------------------------------------------
# class AgentState(TypedDict):
#     messages: Annotated[Sequence[BaseMessage], operator.add]
#     first_name: str
#     phone_number: str
#     lead_status: str
#     lead_priority: str
#     user_intent: str      # NEW: Set by the classifier
#     user_language: str    # NEW: Set by the classifier
#     sender: str           # Tracks which writer is currently active
# ---------------------------------------------------------

# 1. Initialize LLMs (The Hybrid Setup)
nano_llm = ChatOpenAI(
    model="gpt-5.4-nano", api_key=settings.OPENAI_API_KEY, temperature=0.1
)
flagship_llm = ChatOpenAI(
    model="gpt-5.4-mini", api_key=settings.OPENAI_API_KEY, temperature=0.2
)

# 2. Tool Binding (Giving the writers power to read RAG and update CRM)
tool_belt = [create_lead, search_clinic_knowledge, fetch_social_proof, escalate_to_human, update_patient_profile]
smart_writer_llm = flagship_llm.bind_tools(tool_belt)


# ==========================================
# 🚦 NODE 1: THE GATEWAY CLASSIFIER
# ==========================================
class IntentClassification(BaseModel):
    intent: Literal[
        "PRICE_OBJECTION",
        "COMPETITOR_COMPARISON",
        "MEDICAL_FEAR",
        "TREATMENT_QUALIFICATION",
        "READY_TO_BOOK",
        "OUT_OF_SCOPE",
        "LOGISTICS_INQUIRY",
        "AUTHORITY_PROOF",
        "POST_OP_SUPPORT",
    ] = Field(description="Classify the user's core intent.")
    language: str = Field(
        description="The ISO language code the user is speaking (e.g., 'ar', 'en', 'tr', 'ru', 'fr', 'de'). Default to 'ar' if Arabic dialect."
    )


CLASSIFIER_PROMPT = """You are the Lead Intake Triaging Engine for OmniDesk AI (Dental Sales).
Analyze the patient's incoming WhatsApp message, conversation history, and regional dialects (Arabic dialects: Gulf, Levantine, Egyptian, Maghrebi; English; Turkish).

Classify into exactly ONE of the following intents:
- PRICE_OBJECTION: Complaining that dental work (implants, veneers, Hollywood smile) is too expensive or asking for steep discounts.
- COMPETITOR_COMPARISON: Mentioning cheaper clinics in Istanbul/locally, or questionable "all-inclusive free flight" offers.
- MEDICAL_FEAR: Anxious about dental pain, anesthesia, drill sensitivity, swollen gums, or failing implants.
- TREATMENT_QUALIFICATION: Asking about procedures (Veneers vs. Crowns, All-on-4 vs. Single Implants, Whitening). Also use this for general greetings, casual chit-chat, or if the user asks for the agent's name.
- READY_TO_BOOK: Asking to schedule consultation, book a clinic visit, or send deposit/flight details.
- LOGISTICS_INQUIRY: Asking about airport VIP pickup, clinic location, hotel arrangements, or trip duration.
- AUTHORITY_PROOF: Asking for dentist credentials, before/after smile makeovers, clinic certifications.
- POST_OP_SUPPORT: An existing patient reporting pain, bleeding, or issues after receiving treatment.
- OUT_OF_SCOPE: Spam, B2B sales pitches trying to sell to the clinic, or completely irrelevant non-medical gibberish.

Also detect the ISO language code ('ar', 'en', 'tr', 'ru', 'fr', 'de'). Default to 'ar' if Arabic dialect."""

classifier_llm = nano_llm.with_structured_output(IntentClassification)


async def classification_node(state: AgentState):
    """Reads the last message and outputs strict JSON defining the intent and language."""
    # Bulletproof check: If there are no messages, default to treatment qualification
    if not state.get("messages"):
        return {"user_intent": "TREATMENT_QUALIFICATION", "user_language": "ar"}
        
    last_user_msg = state["messages"][-1].content
    
    prompt = f"{CLASSIFIER_PROMPT}\n\nUser message: '{last_user_msg}'"
    classification = await classifier_llm.ainvoke(prompt)
    
    return {
        "user_intent": classification.intent, 
        "user_language": classification.language
    }


# ==========================================
# ✍️ NODES 2: THE SPECIALIZED WRITERS
# ==========================================


async def price_objection_writer(state: AgentState):
    clinic_name = state.get('clinic_name', 'our clinic')
    agent_tone = state.get('agent_tone', 'Professional and empathetic')
    business_rules = state.get('business_rules', '{}')
    
    prompt = f"""
    You are the Digital Assistant for {clinic_name}. Patient: {state.get('first_name', 'Guest')}
    Your conversational tone MUST be: {agent_tone}.
    
    CRITICAL BUSINESS RULES FOR THIS CLINIC:
    {business_rules}

    OBJECTIVE:
    Defend dental treatment value, handle budget objections, and prevent price-shopping drop-offs.

    SALES RULES:
    1. NEVER APOLOGIZE FOR PRICING: High-quality dentistry uses FDA-approved biocompatible implants (like Straumann/Nobel) and master ceramists for natural translucency.
    2. THE REVISION WARNING: Politely note that fixing poorly placed cheap implants or shaved-down fake veneers costs significantly more down the road.
    3. FLEXIBILITY PIVOT: Offer package flexibility (e.g., modular treatments, phased appointments, or checking with the clinic director for seasonal package inclusions).
    4. CALL TO ACTION: Pivot back to getting their photos/X-ray evaluated so the doctor can suggest alternative options that fit their budget."""
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await smart_writer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "price_objection_writer"}


async def competitor_writer(state: AgentState):
    clinic_name = state.get('clinic_name', 'our clinic')
    agent_tone = state.get('agent_tone', 'Professional and empathetic')
    business_rules = state.get('business_rules', '{}')
    
    prompt = f"""
    You are the Digital Assistant for {clinic_name}. Patient: {state.get('first_name', 'Guest')}
    Your conversational tone MUST be: {agent_tone}.
    
    CRITICAL BUSINESS RULES FOR THIS CLINIC:
    {business_rules}

    OBJECTIVE:
    Protect the lead from cut-rate dental clinics and explain why low-cost dental tourism can be risky.

    CRITICAL RULES:
    1. NEVER DIRECT THEM TO A COMPETITOR: You work exclusively for this clinic.
    2. EXPOSE THE DENTAL 'CHEAP TRAP':
       - "Full mouth for $1,500" usually means aggressive, unnecessary root canals, aggressive tooth shaving for crowns instead of minimal-prep veneers, or unbranded commercial implants without international passports.
       - We use genuine, certified materials with lifetime warranties and digital 3D smile design.
    3. CONFIDENT TONE: Reassure them that their health and natural tooth preservation come first."""
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await smart_writer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "competitor_writer"}


async def empathy_writer(state: AgentState):
    clinic_name = state.get('clinic_name', 'our clinic')
    agent_tone = state.get('agent_tone', 'Professional and empathetic')
    business_rules = state.get('business_rules', '{}')
    
    prompt = f"""
    You are the Digital Assistant for {clinic_name}. Patient: {state.get('first_name', 'Guest')}
    Your conversational tone MUST be: {agent_tone}.
    
    CRITICAL BUSINESS RULES FOR THIS CLINIC:
    {business_rules}

    OBJECTIVE:
    Resolve dental anxiety, fear of pain, or fear of artificial-looking "toilet-seat white" teeth.

    RULES:
    1. VALIDATE: Dental anxiety is common. Acknowledge it warmly.
    2. REASSURE: Mention painless local anesthesia, sedation options, and minimally invasive digital dentistry (3D intraoral scanning, no messy impressions).
    3. NATURAL RESULTS: If they fear fake-looking teeth, explain that our ceramists match shape, translucency, and shade to facial symmetry.
    4. Use `fetch_social_proof` to share relevant patient case studies or testimonials."""
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await smart_writer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "empathy_writer"}


async def closer_writer(state: AgentState):
    clinic_name = state.get('clinic_name', 'our clinic')
    agent_tone = state.get('agent_tone', 'Professional and empathetic')
    business_rules = state.get('business_rules', '{}')
    
    prompt = f"""
    You are the Digital Assistant for {clinic_name}. Patient: {state.get('first_name', 'Guest')}
    Your conversational tone MUST be: {agent_tone}.
    
    CRITICAL BUSINESS RULES FOR THIS CLINIC:
    {business_rules}

    OBJECTIVE:
    The patient is ready to schedule a consultation, book a clinic visit, or send deposit/flight details.

    MISSION:
    1. Gather passport details or explain the payment/deposit process.
    2. Confirm preferred travel dates and coordinate with the clinic calendar.
    3. Use 'create_lead' to update their status appropriately.
    4. Make the booking process feel effortless and VIP."""
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await smart_writer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "closer_writer"}


async def qualifier_writer(state: AgentState):
    clinic_name = state.get('clinic_name', 'our clinic')
    agent_tone = state.get('agent_tone', 'Professional and empathetic')
    business_rules = state.get('business_rules', '{}')
    
    prompt = f"""
    You are the Digital Assistant for {clinic_name}. Patient: {state.get('first_name', 'Guest')}
    Your conversational tone MUST be: {agent_tone}.
    
    CRITICAL BUSINESS RULES FOR THIS CLINIC:
    {business_rules}

    SILENT CRM UPDATE RULE:
    Whenever you learn the patient's name, location, or can deduce their gender from their Arabic name/grammar, you MUST call the `update_patient_profile` tool to save it. You can deduce gender easily (e.g., 'Abdulrahman' is MALE). Do this silently while continuing the conversation.

    OBJECTIVE:
    Qualify the patient's dental needs, build trust, and obtain dental photos or a panoramic X-Ray (OPG).

    SALES RULES:
    1. ONE QUESTION RULE: Ask only ONE clear question per message. Never overwhelm the patient with a questionnaire.
    2. THE DENTAL PHOTO PIVOT: If the patient asks for a quote on Veneers, Implants, or a Smile Makeover, explain that the lead dentist needs to assess their bite and bone structure. Ask them to send 2-3 clear photos of their teeth (smiling, biting, open) or an OPG X-ray via WhatsApp.
    3. VALUE ANGLE: Emphasize that customized treatment planning prevents unexpected charges at the chair.
    4. TOOL USAGE: Use `search_clinic_knowledge` to answer specific questions regarding materials (Zirconia, E-Max, Straumann/Swiss implants)."""
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await smart_writer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "qualifier_writer"}

async def logistics_writer(state: AgentState):
    clinic_name = state.get('clinic_name', 'our clinic')
    agent_tone = state.get('agent_tone', 'Professional and empathetic')
    business_rules = state.get('business_rules', '{}')
    
    prompt = f"""
    You are the Digital Assistant for {clinic_name}. Patient: {state.get('first_name', 'Guest')}
    Your conversational tone MUST be: {agent_tone}.
    
    CRITICAL BUSINESS RULES FOR THIS CLINIC:
    {business_rules}

    INTENT: The user is asking about flights, hotels, airport transfers, or Istanbul logistics.
    
    MISSION:
    Make the process sound effortless and luxurious. 
    Explain that our packages include VIP airport pickup, 5-star hotel accommodation, and a native-speaking translator. 
    Do not talk about medical procedures here unless they asked. Focus on the VIP experience.
    """
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await smart_writer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "logistics_writer"}


async def authority_writer(state: AgentState):
    clinic_name = state.get('clinic_name', 'our clinic')
    agent_tone = state.get('agent_tone', 'Professional and empathetic')
    business_rules = state.get('business_rules', '{}')
    
    prompt = f"""
    You are the Digital Assistant for {clinic_name}. Patient: {state.get('first_name', 'Guest')}
    Your conversational tone MUST be: {agent_tone}.
    
    CRITICAL BUSINESS RULES FOR THIS CLINIC:
    {business_rules}

    INTENT: The user is asking for doctor credentials, before/after photos, or hospital accreditations.
    
    MISSION:
    Establish absolute trust. Highlight that our surgeons have 15+ years of experience and perform hundreds of these specific procedures.
    Use 'fetch_social_proof' to mention real patient outcomes or direct them to our Instagram portfolio.
    Separate us from "cheap brokers" by emphasizing our premium medical standards.
    """
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await smart_writer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "authority_writer"}


async def post_op_support_writer(state: AgentState):
    clinic_name = state.get('clinic_name', 'our clinic')
    agent_tone = state.get('agent_tone', 'Professional and empathetic')
    business_rules = state.get('business_rules', '{}')
    
    prompt = f"""
    You are the Digital Assistant for {clinic_name}. Patient: {state.get('first_name', 'Guest')}
    Your conversational tone MUST be: {agent_tone}.
    
    CRITICAL BUSINESS RULES FOR THIS CLINIC:
    {business_rules}

    CRITICAL PROTOCOL:
    1. STRICT MEDICAL SAFETY: Do NOT diagnose or prescribe medications. Tell the patient to visit OUR clinic immediately for an emergency checkup. Do NOT tell them to visit the nearest clinic.
    2. IMMEDIATE REASSURANCE: "Your health and recovery are our priority. I am alerting our on-duty dental surgeon and clinic staff immediately."
    3. ESCALATION: Call `escalate_to_human(reason="Existing patient post-op medical inquiry")` to pause AI and flag the lead as HANDED_OFF."""
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await smart_writer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "post_op_support_writer"}


# ==========================================
# 🪄 NODE 3: THE HUMANIZER (The Secret Weapon)
# ==========================================
async def humanizer_node(state: AgentState):
    """Intercepts the final AI text and formats it for WhatsApp."""
    ai_draft = state["messages"][-1].content
    language = state.get("user_language", "ar")
    first_name = state.get("first_name", "Guest")
    
    prompt = f"""You are a WhatsApp communication expert for medical sales. 
    Your job is to rewrite the AI draft so it reads like a real human coordinator chatting on WhatsApp.

    DRAFT TO REWRITE: "{ai_draft}"
    TARGET LANGUAGE: {language}

    STRICT EDITING RULES:
    1. BREVITY: Keep it under 2 to 3 concise sentences. No corporate fluff or robotic greetings.
    2. NO ROBOT BULLET POINTS: Convert lists into casual conversational speech.
    3. NATURAL FLOW:
       - For Arabic: Use natural conversational phrasing (e.g., "أهلاً بك يا غالي", "ولا تشيل هم أبداً", "يا ريت لو تبعتلنا صورة للأسنان").
       - For English: Use friendly, warm phrasing (e.g., "Hey {first_name}, totally understand your concern!", "Could you snap a quick photo of your smile?").
       - For Turkish: Use warm, professional phrasing (e.g., "Merhaba {first_name}, endişenizi çok iyi anlıyorum!").
    4. WHATSAPP BUBBLES: If the message contains two thoughts, separate them using `|||` so the backend can send them as two distinct messages. Maximum 2 bubbles.

    Output ONLY the rewritten text."""
    messages = [SystemMessage(content=prompt)]
    final_response = await flagship_llm.ainvoke(messages)
    
    return {"messages": [final_response], "sender": "humanizer"}


def sleep_node(state: AgentState):
    """Fired when the lead is in a terminal state."""
    print("💤 [AI is Sleeping] Terminal state reached.")
    return {
        "messages": [SystemMessage(content="[SYSTEM: DO_NOT_SEND_REPLY]")],
        "sender": "sleep",
    }


# ==========================================
# 🔀 DYNAMIC ROUTERS
# ==========================================


def initial_zombie_check(state: AgentState) -> Literal["sleep", "classifier"]:
    """First check: Is this lead dead or handed off?"""
    status = state.get("lead_status", "NEW")
    if status in ["WON", "LOST", "UNQUALIFIED", "HANDED_OFF"]:
        return "sleep"
    return "classifier"


def dynamic_intent_router(state: AgentState) -> str:
    """Routes based on the JSON classification."""
    intent = state.get("user_intent")

    if intent == "PRICE_OBJECTION":
        return "price_objection_writer"
    if intent == "COMPETITOR_COMPARISON":
        return "competitor_writer"
    if intent == "MEDICAL_FEAR":
        return "empathy_writer"
    if intent == "READY_TO_BOOK":
        return "closer_writer"
    if intent == "OUT_OF_SCOPE":
        return "sleep"  # Or a dedicated bouncer node
    if intent == "LOGISTICS_INQUIRY":
        return "logistics_writer"
    if intent == "AUTHORITY_PROOF":
        return "authority_writer"
    if intent == "POST_OP_SUPPORT":
        return "post_op_support_writer"

    return "qualifier_writer"  # Default: TREATMENT_QUALIFICATION


def tool_or_humanize_router(state: AgentState) -> Literal["tools", "humanizer"]:
    """If the writer called a tool, run it. Otherwise, send draft to Humanizer."""
    if state["messages"][-1].tool_calls:
        return "tools"
    return "humanizer"


def route_after_tool(state: AgentState) -> str:
    """Send tool result back to the exact writer that requested it."""
    return state["sender"]


# ==========================================
# 🏗️ BUILD THE GRAPH
# ==========================================
builder = StateGraph(AgentState)

# Add Nodes
builder.add_node("logistics_writer", logistics_writer)
builder.add_node("authority_writer", authority_writer)
builder.add_node("post_op_support_writer", post_op_support_writer)
builder.add_node("sleep", sleep_node)
builder.add_node("classifier", classification_node)
builder.add_node("price_objection_writer", price_objection_writer)
builder.add_node("competitor_writer", competitor_writer)
builder.add_node("empathy_writer", empathy_writer)
builder.add_node("closer_writer", closer_writer)
builder.add_node("qualifier_writer", qualifier_writer)
builder.add_node("humanizer", humanizer_node)
builder.add_node("tools", ToolNode(tool_belt))

# Flow Logic
builder.add_conditional_edges(START, initial_zombie_check)
builder.add_edge("sleep", END)
builder.add_conditional_edges("classifier", dynamic_intent_router)

# All writers route to either tools (if requested) or the humanizer
writers = [
    "price_objection_writer",
    "competitor_writer",
    "empathy_writer",
    "closer_writer",
    "qualifier_writer",
    "logistics_writer", 
    "authority_writer", 
    "post_op_support_writer"
]
for writer in writers:
    builder.add_conditional_edges(writer, tool_or_humanize_router)

# Tools route back to the writer
builder.add_conditional_edges("tools", route_after_tool)

# Humanizer is the final step before the gRPC payload is sent
builder.add_edge("humanizer", END)

agent_app = builder.compile()
