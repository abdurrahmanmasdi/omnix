import os
import json
from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from app.modules.agent.state import ConversationState
from app.core.config import settings
from app.modules.agent.tools import search_clinic_knowledge, fetch_social_proof, escalate_to_human


# 1. Initialize LLMs
extractor_llm = ChatOpenAI(model="gpt-5.6-luna", api_key=settings.OPENAI_API_KEY, temperature=0.1, model_kwargs={"reasoning_effort": "none"})
flagship_llm = ChatOpenAI(model="gpt-5.6-terra", api_key=settings.OPENAI_API_KEY, temperature=0.3, model_kwargs={"reasoning_effort": "none"})

tool_belt = [search_clinic_knowledge, fetch_social_proof, escalate_to_human]
smart_writer_llm = flagship_llm.bind_tools(tool_belt)

HANDOFF_PROMPT = """
CRITICAL RULE - HUMAN HANDOFF:
You have access to the `escalate_to_human` tool. You MUST use it IMMEDIATELY if any of these psychological triggers occur:
1. EXPLICIT REQUEST: The user explicitly asks for a "human", "doctor", "manager", or "agent".
2. HIGH FRUSTRATION: The user expresses severe anger, uses profanity, or is repeatedly dissatisfied with your answers.
3. COMPLEX MEDICAL ADVICE: The user asks for post-op diagnostic advice or complex medical opinions exceeding general sales knowledge.
4. PAYMENT BOTTLENECK: The user is ready to pay but requires a custom discount or custom payment link you cannot provide.
If you decide to hand off, your final text message MUST reassure the user (e.g., "I understand completely. I'm transferring you to one of our senior medical consultants right now. They will review our chat and message you here shortly!").
"""

# 2. Define Structured Output Schema
class ExtractionOutput(BaseModel):
    name: str | None = Field(description="Extract if the user mentions their name.")
    service_interested: str | None = Field(description="e.g., dental implants, veneers.")
    is_medical_image: bool = Field(description="True ONLY if the provided vision system description confirms it's a dental/medical image. False otherwise.")
    customer_intent: str | None = Field(description="Classify the main goal: 'inquiry', 'pricing', 'booking', 'general', or 'out_of_domain' if the user asks about something completely unrelated to dental/medical services.")
    active_objection: str | None = Field(description="ONLY classify as an objection if the user explicitly complains about high prices ('too expensive'), expresses intense fear, or distrusts the clinic. Explaining dental problems (like a missing tooth/empty space) or asking for prices are NOT objections. Default to 'none'.")

# 3. Build the Extraction Node
async def extract_and_classify(state: ConversationState) -> dict:
    from langchain_core.messages import HumanMessage
    # Get the latest message (it can be multimodal)
    messages = state.get("messages", [])
    if not messages:
        return {}
        
    has_image = False
    text_only_messages = []
    
    # 📸 Task 1: Aggressive Debugging & Text-Only Separation
    for msg in messages:
        print(f"🕵️ [GRAPH DEBUG] Inspecting msg type: {getattr(msg, 'type', type(msg))}, content type: {type(getattr(msg, 'content', None))}, content_repr: {repr(getattr(msg, 'content', None))[:200]}")
        if getattr(msg, "type", "") == "human" and isinstance(msg.content, (list, tuple)):
            text_parts = []
            for content_part in msg.content:
                if isinstance(content_part, dict):
                    if content_part.get("type") == "image_url":
                        has_image = True
                        img_url = content_part.get("image_url", {}).get("url", "")
                        img_len = len(img_url)
                        print(f"📸 [DEBUG] Image payload length inside Graph: {img_len} chars")
                        if img_len < 10000:
                            print("⚠️ ERROR: IMAGE CORRUPTED OR TOO SMALL. CHECK NESTJS WHATSAPP DOWNLOAD LOGIC!")
                    elif content_part.get("type") == "text":
                        text_parts.append(content_part)
                else:
                    text_parts.append(content_part)
            text_only_messages.append(HumanMessage(content=text_parts))
        else:
            text_only_messages.append(msg)

    vision_text = None
    if has_image:
        print("🧠 [VISION BRAIN] Activating raw vision model bypass...")
        vision_prompt = "You are a pure vision model. Do NOT answer the user. Do NOT provide prices. ONLY describe what is in the image in 2 sentences."
        vision_messages = [SystemMessage(content=vision_prompt), messages[-1]]
        vision_response = await flagship_llm.ainvoke(vision_messages)
        vision_text = vision_response.content
        print(f"👁️ [VISION RESULT] {vision_text}")

    system_prompt = """You are a highly analytical AI assistant.
Analyze the user's latest message.
Extract the facts about the customer and classify their intent and objections.
Follow the steps in the schema exactly."""

    if vision_text:
        system_prompt += f"\n\nIMPORTANT: The user sent an image. Our vision system described it as: {vision_text}. Use this description to determine if they provided medical evidence."

    # Invoke structured output with TEXT-ONLY messages to prevent Vision Blindness
    extractor = extractor_llm.with_structured_output(ExtractionOutput)
    response = await extractor.ainvoke([SystemMessage(content=system_prompt)] + text_only_messages)
    
    # Initialize updates
    updates = {}
    
    # Safely merge customer data
    current_customer = state.get("customer", {})
    new_customer_data = dict(current_customer) # copy
    
    customer_updated = False
    
    if response.name and not current_customer.get("name"):
        new_customer_data["name"] = response.name
        customer_updated = True
        
    if response.service_interested and not current_customer.get("service_interested"):
        new_customer_data["service_interested"] = response.service_interested
        customer_updated = True
        
    if response.is_medical_image and not current_customer.get("is_medical_evidence_provided"):
        new_customer_data["is_medical_evidence_provided"] = True
        customer_updated = True
        
    if customer_updated:
        updates["customer"] = new_customer_data
        
    # Update intent and objection directly
    if response.customer_intent:
        updates["current_intent"] = response.customer_intent
        
    if response.active_objection:
        updates["active_objection"] = response.active_objection
        
    if vision_text:
        updates["visual_pixel_analysis"] = vision_text

    # 🚀 Lead Qualification Sync (State Amnesia Fix)
    is_fully_qualified = bool(new_customer_data.get("name")) and bool(new_customer_data.get("is_medical_evidence_provided"))
    is_currently_new = state.get("current_stage") == "NEW"

    if is_fully_qualified and is_currently_new:
        # Pull existing actions to prevent overwriting
        current_actions = state.get("pending_crm_actions", [])
        new_actions = list(current_actions)
        
        # Safely dump JSON payload for the NestJS parser
        payload = json.dumps({"status": "QUALIFIED"})
        new_actions.append(f'TOOL_ACTION:UPDATE_LEAD:{payload}')
        
        # Update the node outputs
        updates["pending_crm_actions"] = new_actions
        updates["current_stage"] = "QUALIFYING"
        
    return updates

def sales_router(state: ConversationState) -> str:
    current_intent = state.get("current_intent")
    active_objection = state.get("active_objection")
    
    # Priority 0: Out of Domain Guardrail
    if current_intent == "out_of_domain":
        return "out_of_domain_node"
        
    # Priority 1: Objections
    if active_objection and active_objection.lower() != "none":
        return "objection_handler_node"
        
    # Priority 2: Qualification
    customer = state.get("customer", {})
    if not customer.get("name") or not customer.get("is_medical_evidence_provided"):
        return "qualification_node"
        
    # Priority 3: Intent-based Routing
    if current_intent == "booking":
        return "closing_node"
    if current_intent == "pricing":
        return "value_pitch_node"
        
    # Fallback
    return "general_qa_node"

# 5. Specialized Sales Nodes (Placeholders)
async def objection_handler_node(state: ConversationState):
    from langchain_core.messages import ToolMessage
    from app.modules.agent.tools import fetch_social_proof
    
    clinic_name = state.get("clinic_name", "our clinic")
    prompt = f"""Act as a Senior Medical Sales Consultant representing {clinic_name}. The user has an objection (fear, price, trust). 
    Use the fetch_social_proof tool to find a relevant patient success story. Acknowledge their concern with deep empathy, present the social proof, and end with a gentle question to move forward. Max 3-4 sentences."""
    
    prompt += "\n" + HANDOFF_PROMPT
    
    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    
    # 1. Initial Call with tool-enabled LLM
    response = await smart_writer_llm.ainvoke(messages)
    
    new_messages = [response]
    
    # 2. Execute RAG if requested
    if hasattr(response, "tool_calls") and response.tool_calls:
        messages.append(response)
        for tool_call in response.tool_calls:
            if tool_call["name"] == "fetch_social_proof":
                tool_result = await fetch_social_proof.ainvoke(
                    tool_call, 
                    config={"configurable": {"organization_id": state["organization_id"]}}
                )
            elif tool_call["name"] == "search_clinic_knowledge":
                tool_result = await search_clinic_knowledge.ainvoke(
                    tool_call, 
                    config={"configurable": {"organization_id": state["organization_id"]}}
                )
            elif tool_call["name"] == "escalate_to_human":
                tool_result = await escalate_to_human.ainvoke(
                    tool_call, 
                    config={"configurable": {"organization_id": state["organization_id"], "conversation_id": state["conversation_id"]}}
                )
            else:
                tool_result = "Error: Tool not found."
                
            tool_msg = ToolMessage(tool_call_id=tool_call["id"], content=str(tool_result), name=tool_call["name"])
            messages.append(tool_msg)
            new_messages.append(tool_msg)
                
        # 3. Final Call: MUST use flagship_llm (unbound) to FORCE text output and prevent infinite tool loops
        final_response = await flagship_llm.ainvoke(messages)
        new_messages.append(final_response)
        
    return {"messages": new_messages, "current_stage": "OBJECTION_HANDLING"}

async def qualification_node(state: ConversationState):
    customer = state.get("customer", {})
    clinic_name = state.get("clinic_name", "our clinic")
    
    missing_info = []
    if not customer.get("name"):
        missing_info.append("Patient Name")
    if not customer.get("is_medical_evidence_provided"):
        missing_info.append("Photo of teeth or OPG X-ray")
        
    missing_str = ", ".join(missing_info)
    visual_analysis = state.get("visual_pixel_analysis", "")
    
    prompt = f"""You are a Senior Medical Sales Consultant representing {clinic_name} on WhatsApp.
Your goal is to build rapport, answer the user's questions, and gently guide them toward providing the information we need to quote them.

CRITICAL SALES RULE (Acknowledge -> Answer -> Pivot):
1. ALWAYS start by warmly acknowledging what the user just said or asked.
2. If they asked a direct question (e.g. 'how much is it?'), answer it naturally or give an estimated range. Do NOT ignore their questions.
3. Finally, PIVOT gracefully by asking a conversational question to gather missing info.

The patient is currently missing: {missing_str}.
DO NOT aggressively demand an OPG X-ray in every message. Build trust first. If they are just asking general questions, answer them nicely and casually mention that a photo of their teeth would help give a precise quote.
"""
    if visual_analysis:
        prompt += f"""
IMPORTANT: The patient just sent an image. Our vision system analyzed it as: "{visual_analysis}".
- If the analysis confirms it IS a valid dental photo or X-ray, warmly THANK THEM for the clear image, and ONLY ask for the remaining missing info ({missing_str}).
- If the analysis shows an irrelevant object (like a laptop/dark frame), humorously point it out and ask for the teeth photo.
"""
    
    prompt += """
Keep your response under 3 sentences. Use a natural, friendly WhatsApp tone."""

    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    response = await flagship_llm.ainvoke(messages)
    
    return {"messages": [response], "current_stage": "QUALIFYING"}

async def value_pitch_node(state: ConversationState):
    from langchain_core.messages import ToolMessage
    from app.modules.agent.tools import search_clinic_knowledge
    
    clinic_name = state.get("clinic_name", "our clinic")
    prompt = f"""Act as an elite Senior Medical Sales Consultant representing {clinic_name}. The user is asking for pricing or service details.
    Use the search_clinic_knowledge tool to find real prices and info. NEVER invent prices. 
    Use the 'Value Sandwich' technique: [State high quality] -> [Give the price from tool] -> [Highlight pain-free/warranty].
    Keep it conversational (WhatsApp style) and end with a Call-To-Action (e.g., free consultation check)."""
    
    prompt += "\n" + HANDOFF_PROMPT
    
    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    
    # 1. Initial Call with tool-enabled LLM
    response = await smart_writer_llm.ainvoke(messages)
    
    new_messages = [response]
    
    # 2. Execute RAG if requested
    if hasattr(response, "tool_calls") and response.tool_calls:
        messages.append(response)
        for tool_call in response.tool_calls:
            if tool_call["name"] == "search_clinic_knowledge":
                tool_result = await search_clinic_knowledge.ainvoke(
                    tool_call, 
                    config={"configurable": {"organization_id": state["organization_id"]}}
                )
            elif tool_call["name"] == "fetch_social_proof":
                tool_result = await fetch_social_proof.ainvoke(
                    tool_call, 
                    config={"configurable": {"organization_id": state["organization_id"]}}
                )
            elif tool_call["name"] == "escalate_to_human":
                tool_result = await escalate_to_human.ainvoke(
                    tool_call, 
                    config={"configurable": {"organization_id": state["organization_id"], "conversation_id": state["conversation_id"]}}
                )
            else:
                tool_result = "Error: Tool not found."
                
            tool_msg = ToolMessage(tool_call_id=tool_call["id"], content=str(tool_result), name=tool_call["name"])
            messages.append(tool_msg)
            new_messages.append(tool_msg)
        
        # 3. Final Call: MUST use flagship_llm (unbound) to FORCE text output and prevent infinite tool loops
        final_response = await flagship_llm.ainvoke(messages)
        new_messages.append(final_response)
        
    return {"messages": new_messages, "current_stage": "PITCHING"}

async def closing_node(state: ConversationState):
    clinic_name = state.get("clinic_name", "our clinic")
    prompt = f"""Act as an elite Senior Medical Sales Consultant representing {clinic_name}. The user is ready to book or showing high intent. 
    Create a sense of urgency (e.g., 'Dr. [Name] has only 2 slots left this week' or 'We have a special discount ending tomorrow'). 
    Ask them explicitly for their preferred day and time for the consultation. 
    Keep it under 3 sentences, conversational (WhatsApp style), and extremely warm."""
    
    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    response = await flagship_llm.ainvoke(messages)
    
    return {"messages": [response], "current_stage": "CLOSING"}

async def out_of_domain_node(state: ConversationState):
    prompt = """Act as a professional medical sales consultant. The user just asked a question that is completely outside the scope of our dental/medical clinic (e.g., tech support, general knowledge, pets, etc).
    Politely and warmly apologize, state that you can only assist with clinic-related inquiries or bookings, and ask if they need help with their dental care."""
    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    response = await flagship_llm.ainvoke(messages)
    return {"messages": [response], "current_stage": "OUT_OF_DOMAIN"}

async def general_qa_node(state: ConversationState):
    from langchain_core.messages import ToolMessage
    from app.modules.agent.tools import search_clinic_knowledge
    
    clinic_name = state.get("clinic_name", "our clinic")
    prompt = f"""Act as a Senior Medical Sales Consultant representing {clinic_name}. The user is asking general questions about the clinic, doctors, location, or procedures.
    Use the search_clinic_knowledge tool to find accurate information. NEVER invent details. 
    Keep your response friendly, concise, and conversational (WhatsApp style). End by asking if they have any other questions or if they'd like to book a consultation."""
    
    prompt += "\n" + HANDOFF_PROMPT
    
    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    
    response = await smart_writer_llm.ainvoke(messages)
    new_messages = [response]
    
    if hasattr(response, "tool_calls") and response.tool_calls:
        messages.append(response)
        for tool_call in response.tool_calls:
            if tool_call["name"] == "search_clinic_knowledge":
                tool_result = await search_clinic_knowledge.ainvoke(
                    tool_call, 
                    config={"configurable": {"organization_id": state["organization_id"]}}
                )
            elif tool_call["name"] == "escalate_to_human":
                tool_result = await escalate_to_human.ainvoke(
                    tool_call, 
                    config={"configurable": {"organization_id": state["organization_id"], "conversation_id": state["conversation_id"]}}
                )
            else:
                tool_result = "Error: Tool not found."
                
            tool_msg = ToolMessage(tool_call_id=tool_call["id"], content=str(tool_result), name=tool_call["name"])
            messages.append(tool_msg)
            new_messages.append(tool_msg)
                
        final_response = await flagship_llm.ainvoke(messages)
        new_messages.append(final_response)
        
    return {"messages": new_messages, "current_stage": "NURTURING"}

def after_sales_router(state: ConversationState) -> str:
    if state.get("needs_summarization"):
        return "summarizer_node"
    return END

async def summarizer_node(state: ConversationState):
    prompt = "Summarize the key medical requirements, objections, and user traits from this conversation history. Keep it concise."
    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    response = await extractor_llm.ainvoke(messages)
    
    new_summary = response.content
    action_payload = json.dumps({"summary": new_summary})
    
    current_actions = state.get("pending_crm_actions", [])
    new_actions = list(current_actions)
    new_actions.append(f"TOOL_ACTION:UPDATE_SUMMARY:{action_payload}")
    
    return {"pending_crm_actions": new_actions}

# 6. Build the Graph
builder = StateGraph(ConversationState)

# Add Nodes
builder.add_node("extract_and_classify", extract_and_classify)
builder.add_node("objection_handler_node", objection_handler_node)
builder.add_node("qualification_node", qualification_node)
builder.add_node("value_pitch_node", value_pitch_node)
builder.add_node("closing_node", closing_node)
builder.add_node("general_qa_node", general_qa_node)
builder.add_node("out_of_domain_node", out_of_domain_node)
builder.add_node("summarizer_node", summarizer_node)

# Flow Logic
builder.add_edge(START, "extract_and_classify")
builder.add_conditional_edges("extract_and_classify", sales_router)

# All sales nodes conditionally route to summarizer if needed
for node in ["objection_handler_node", "qualification_node", "value_pitch_node", "closing_node", "general_qa_node", "out_of_domain_node"]:
    builder.add_conditional_edges(node, after_sales_router)

builder.add_edge("summarizer_node", END)

# Compile
agent_app = builder.compile()