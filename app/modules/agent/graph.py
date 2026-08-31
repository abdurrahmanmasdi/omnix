import os
from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from app.modules.agent.state import ConversationState
from app.core.config import settings
from app.modules.agent.tools import search_clinic_knowledge


# 1. Initialize LLMs
extractor_llm = ChatOpenAI(model="gpt-5.4-mini",api_key=settings.OPENAI_API_KEY, temperature=0.1)
flagship_llm = ChatOpenAI(model="gpt-5.4-nano", api_key=settings.OPENAI_API_KEY, temperature=0.3)

tool_belt = [search_clinic_knowledge]
smart_writer_llm = flagship_llm.bind_tools(tool_belt)

# 2. Define Structured Output Schema
class ExtractionOutput(BaseModel):
    name: str | None = Field(description="Extract if the user mentions their name.")
    service_interested: str | None = Field(description="e.g., dental implants, veneers.")
    is_medical_image: bool = Field(description="True ONLY if the provided vision system description confirms it's a dental/medical image. False otherwise.")
    customer_intent: str | None = Field(description="Classify the main goal: 'inquiry', 'pricing', 'booking', or 'general'.")
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
        
    return updates

# 4. The Deterministic Sales Router
def sales_router(state: ConversationState) -> str:
    active_objection = state.get("active_objection")
    
    # Priority 1: Objections
    if active_objection and active_objection.lower() != "none":
        return "objection_handler_node"
        
    # Priority 2: Qualification
    customer = state.get("customer", {})
    if not customer.get("name") or not customer.get("is_medical_evidence_provided"):
        return "qualification_node"
        
    # Priority 3: Intent-based Routing
    current_intent = state.get("current_intent")
    if current_intent == "booking":
        return "closing_node"
    if current_intent == "pricing":
        return "value_pitch_node"
        
    # Fallback
    return "general_qa_node"

# 5. Specialized Sales Nodes (Placeholders)
async def objection_handler_node(state: ConversationState):
    return {"messages": [AIMessage(content="[DUMMY: Handling Objection]")], "current_stage": "OBJECTION_HANDLING"}

async def qualification_node(state: ConversationState):
    customer = state.get("customer", {})
    missing_info = []
    if not customer.get("name"):
        missing_info.append("Patient Name")
    if not customer.get("is_medical_evidence_provided"):
        missing_info.append("Photo of teeth or OPG X-ray")
        
    missing_str = ", ".join(missing_info)
    visual_analysis = state.get("visual_pixel_analysis", "")
    
    prompt = f"""You are a warm, professional medical sales coordinator on WhatsApp.
The patient is currently missing the following information to proceed: {missing_str}.
"""
    if visual_analysis:
        prompt += f"""
IMPORTANT: The patient just sent an image. Our vision system analyzed it as: "{visual_analysis}".
- If the analysis confirms it IS a valid dental photo or X-ray, warmly THANK THEM for the clear image, and ONLY ask for the remaining missing info ({missing_str}).
- If the analysis shows an irrelevant object (like a laptop/dark frame), humorously point it out and ask for the teeth photo.
"""
    
    prompt += """
Keep your response under 3 sentences. Use a natural, friendly WhatsApp tone.
Do not answer medical questions or provide pricing yet."""

    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    response = await flagship_llm.ainvoke(messages)
    
    return {"messages": [response], "current_stage": "QUALIFYING"}

async def value_pitch_node(state: ConversationState):
    from langchain_core.messages import ToolMessage
    from app.modules.agent.tools import search_clinic_knowledge
    
    prompt = """Act as an elite medical sales consultant. The user is asking for pricing or service details.
    Use the search_clinic_knowledge tool to find real prices and info. NEVER invent prices. 
    Use the 'Value Sandwich' technique: [State high quality] -> [Give the price from tool] -> [Highlight pain-free/warranty].
    Keep it conversational (WhatsApp style) and end with a Call-To-Action (e.g., free consultation check)."""
    
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
                tool_msg = ToolMessage(tool_call_id=tool_call["id"], content=str(tool_result), name=tool_call["name"])
                messages.append(tool_msg)
                new_messages.append(tool_msg)
        
        # 3. Final Call: MUST use flagship_llm (unbound) to FORCE text output and prevent infinite tool loops
        final_response = await flagship_llm.ainvoke(messages)
        new_messages.append(final_response)
        
    return {"messages": new_messages, "current_stage": "PITCHING"}

async def closing_node(state: ConversationState):
    return {"messages": [AIMessage(content="[DUMMY: Closing the Deal / Booking]")], "current_stage": "CLOSING"}

async def general_qa_node(state: ConversationState):
    return {"messages": [AIMessage(content="[DUMMY: General QA]")], "current_stage": "NURTURING"}

# 6. Build the Graph
builder = StateGraph(ConversationState)

# Add Nodes
builder.add_node("extract_and_classify", extract_and_classify)
builder.add_node("objection_handler_node", objection_handler_node)
builder.add_node("qualification_node", qualification_node)
builder.add_node("value_pitch_node", value_pitch_node)
builder.add_node("closing_node", closing_node)
builder.add_node("general_qa_node", general_qa_node)

# Flow Logic
builder.add_edge(START, "extract_and_classify")
builder.add_conditional_edges("extract_and_classify", sales_router)

# All sales nodes terminal for this turn
builder.add_edge("objection_handler_node", END)
builder.add_edge("qualification_node", END)
builder.add_edge("value_pitch_node", END)
builder.add_edge("closing_node", END)
builder.add_edge("general_qa_node", END)

# Compile
agent_app = builder.compile()