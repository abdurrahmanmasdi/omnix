import json
from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage
from app.modules.agent.state import ConversationState
from app.modules.agent.actions import parse_virtual_action
from app.modules.safety.policy import SAFE_HANDOFF_MESSAGE

async def _execute_tool_calls(state: ConversationState, response, messages, new_messages, new_pending_actions) -> bool:
    """Return True when a tool result cannot support a patient-facing answer."""
    tools_by_name = {
        "search_clinic_knowledge": search_clinic_knowledge,
        "fetch_social_proof": fetch_social_proof,
        "fetch_battlecard": fetch_battlecard,
        "escalate_to_human": escalate_to_human,
    }
    config = {"configurable": {
        "organization_id": state["organization_id"],
        "conversation_id": state["conversation_id"],
    }}
    for call in getattr(response, "tool_calls", []):
        if not isinstance(call, dict):
            return True
        tool_name, tool_args, tool_id = call.get("name"), call.get("args"), call.get("id")
        if (tool_name not in tools_by_name or not isinstance(tool_args, dict)
                or not isinstance(tool_id, str) or not 1 <= len(tool_id) <= 128):
            return True
        try:
            result = await tools_by_name[tool_name].ainvoke(tool_args, config=config)
        except Exception:
            return True
        content = result.content if isinstance(result, ToolMessage) else str(result)
        if not isinstance(content, str) or content.startswith("UNVERIFIED:"):
            return True
        try:
            decoded = json.loads(content)
        except (TypeError, ValueError):
            decoded = None
        if isinstance(decoded, dict) and "action" in decoded:
            action = parse_virtual_action(decoded)
            if action is None:
                return True
            new_pending_actions.append(json.dumps({"action": action[0], "payload": action[1]}))
        elif tool_name == "escalate_to_human":
            return True
        tool_msg = ToolMessage(tool_call_id=tool_id, content=content, name=tool_name)
        messages.append(tool_msg)
        new_messages.append(tool_msg)
    return False

from app.modules.agent.prompts import (
    AI_IDENTITY_PROMPT, EXTRACTOR_SYSTEM_PROMPT, VISION_PROMPT, HANDOFF_PROMPT, 
    OUT_OF_DOMAIN_PROMPT, SUMMARIZER_PROMPT, COMPLIANCE_CHECKER_PROMPT
)
from app.infrastructure.llm_factory import LLMFactory
from app.modules.agent.tools import search_clinic_knowledge, fetch_social_proof, fetch_battlecard, escalate_to_human

# 2. Define Structured Output Schema
class ExtractionOutput(BaseModel):
    name: str | None = Field(description="Extract if the user mentions their name.")
    service_interested: str | None = Field(description="e.g., dental implants, veneers.")
    is_medical_image: bool = Field(description="True ONLY if the provided vision system description confirms it's a dental/medical image. False otherwise.")
    customer_intent: str | None = Field(description="Classify the main goal: 'inquiry', 'pricing', 'booking', 'general', or 'out_of_domain' if the user asks about something completely unrelated to dental/medical services.")
    active_objection: str | None = Field(description="ONLY classify as an objection if the user explicitly complains about high prices ('too expensive'), expresses intense fear, or distrusts the clinic. Explaining dental problems (like a missing tooth/empty space) or asking for prices are NOT objections. Default to 'none'.")


class ComplianceOutput(BaseModel):
    is_compliant: bool = Field(description="True if the response is safe and factual. False if it invents prices/procedures.")
    feedback: str | None = Field(description="If is_compliant is false, explain what was hallucinated and how to fix it.")

async def extract_and_classify(state: ConversationState) -> dict:
    messages = state.get("messages", [])
    if not messages:
        return {}
        
    has_image = False
    text_only_messages = []
    
    # Task 1: Aggressive Debugging & Text-Only Separation
    for msg in messages:
        if getattr(msg, "type", "") == "human" and isinstance(msg.content, (list, tuple)):
            text_parts = []
            for content_part in msg.content:
                if isinstance(content_part, dict):
                    if content_part.get("type") == "image_url":
                        has_image = True
                    elif content_part.get("type") == "text":
                        text_parts.append(content_part)
                else:
                    text_parts.append(content_part)
            text_only_messages.append(HumanMessage(content=text_parts))
        else:
            text_only_messages.append(msg)

    vision_text = None
    flagship_llm = LLMFactory.get_flagship_llm()
    extractor_llm = LLMFactory.get_extractor_llm()

    if has_image:
        vision_messages = [SystemMessage(content=VISION_PROMPT), messages[-1]]
        vision_response = await flagship_llm.ainvoke(vision_messages)
        vision_text = vision_response.content

    system_prompt_str = EXTRACTOR_SYSTEM_PROMPT

    if vision_text:
        system_prompt_str += f"\n\nIMPORTANT: The user sent an image. Our vision system described it as: {vision_text}. Use this description to determine if they provided medical evidence."

    extractor = extractor_llm.with_structured_output(ExtractionOutput)
    response = await extractor.ainvoke([SystemMessage(content=system_prompt_str)] + text_only_messages)
    
    updates = {}
    current_customer = state.get("customer", {})
    new_customer_data = dict(current_customer)
    
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
        
    if response.customer_intent:
        updates["current_intent"] = response.customer_intent
    if response.active_objection:
        updates["active_objection"] = response.active_objection
    if vision_text:
        updates["visual_pixel_analysis"] = vision_text

    is_fully_qualified = bool(new_customer_data.get("name")) and bool(new_customer_data.get("is_medical_evidence_provided"))
    is_currently_new = state.get("current_stage") == "NEW"

    if is_fully_qualified and is_currently_new:
        current_actions = state.get("pending_crm_actions", [])
        new_actions = list(current_actions)
        payload = {"status": "QUALIFIED"}
        new_actions.append(json.dumps({
            "action": "UPDATE_LEAD",
            "payload": payload
        }))
        
        updates["pending_crm_actions"] = new_actions
        updates["current_stage"] = "QUALIFYING"
        
    return updates

def _get_smart_llm():
    llm = LLMFactory.get_flagship_llm()
    return llm.bind_tools([search_clinic_knowledge, fetch_social_proof, fetch_battlecard, escalate_to_human])

from langchain_core.messages import AIMessage
async def objection_handler_node(state: ConversationState):
    attempts = state.get("generation_attempts", 0)

    if not state.get("is_compliant", True) and attempts >= 2:
        from app.modules.agent.tools import escalate_to_human
        escalation_msg = await escalate_to_human.ainvoke({"reason": "AI failed compliance checks multiple times."}, config={"configurable": {"organization_id": state["organization_id"], "conversation_id": state["conversation_id"]}})
        current_actions = state.get("pending_crm_actions", [])
        new_actions = list(current_actions)
        new_actions.append(escalation_msg)
        safe_response = AIMessage(content=SAFE_HANDOFF_MESSAGE)
        return {"messages": [safe_response], "pending_crm_actions": new_actions, "current_stage": "HANDED_OFF", "is_compliant": True, "generation_attempts": 0}
    clinic_name = state.get("clinic_name", "our clinic")
    prompt = f"""You are the AI patient coordinator for {clinic_name}. The user has an objection (fear, price, trust, or competitor comparison). 
    If they mention a competitor or object to the price, you MUST use the fetch_battlecard tool defensively to find our approved rebuttal. 
    Otherwise, use the fetch_social_proof tool to find a relevant patient success story. 
    Acknowledge their concern with deep empathy, present the proof/rebuttal, and end with a gentle question to move forward. Max 3-4 sentences."""
    prompt += "\n" + AI_IDENTITY_PROMPT + "\n" + HANDOFF_PROMPT
    

    # T24: Inject Tone and Business Rules
    agent_tone = state.get("agent_tone", "Professional and empathetic")
    business_rules = state.get("business_rules", "{}")
    prompt += f"\n\nPERSONA TONE: {agent_tone}\n"
    prompt += f"BUSINESS RULES: {business_rules}\n"

    if not state.get("is_compliant", True) and state.get("compliance_feedback"):
        prompt += "\n\nCRITICAL COMPLIANCE FEEDBACK ON PREVIOUS ATTEMPT: " + state.get("compliance_feedback") + "\nYou MUST fix this hallucination immediately."

    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    
    smart_writer_llm = _get_smart_llm()
    response = await smart_writer_llm.ainvoke(messages)
    
    new_messages = [response]
    node_updates = {"messages": new_messages, "current_stage": "OBJECTION_HANDLING"}
    new_pending_actions = list(state.get("pending_crm_actions", []))
    
    if getattr(response, "tool_calls", None):
        messages.append(response)
        unverified = await _execute_tool_calls(
            state, response, messages, new_messages, new_pending_actions
        )
        if unverified:
            new_pending_actions.append(json.dumps({
                "action": "HANDOFF_TO_HUMAN",
                "payload": {"reason": "tool_result_unverified"},
            }))
            new_messages.append(AIMessage(content=SAFE_HANDOFF_MESSAGE))
        else:
            final_response = await LLMFactory.get_flagship_llm().ainvoke(messages)
            new_messages.append(final_response)

    if len(new_pending_actions) > len(state.get("pending_crm_actions", [])):
        node_updates["pending_crm_actions"] = new_pending_actions
        
    return node_updates

async def qualification_node(state: ConversationState):
    attempts = state.get("generation_attempts", 0)

    if not state.get("is_compliant", True) and attempts >= 2:
        from app.modules.agent.tools import escalate_to_human
        escalation_msg = await escalate_to_human.ainvoke({"reason": "AI failed compliance checks multiple times."}, config={"configurable": {"organization_id": state["organization_id"], "conversation_id": state["conversation_id"]}})
        current_actions = state.get("pending_crm_actions", [])
        new_actions = list(current_actions)
        new_actions.append(escalation_msg)
        safe_response = AIMessage(content=SAFE_HANDOFF_MESSAGE)
        return {"messages": [safe_response], "pending_crm_actions": new_actions, "current_stage": "HANDED_OFF", "is_compliant": True, "generation_attempts": 0}

    customer = state.get("customer", {})
    clinic_name = state.get("clinic_name", "our clinic")
    
    missing_info = []
    if not customer.get("name"):
        missing_info.append("Patient Name")
    if not customer.get("is_medical_evidence_provided"):
        missing_info.append("Photo of teeth or OPG X-ray")
        
    missing_str = ", ".join(missing_info)
    visual_analysis = state.get("visual_pixel_analysis", "")
    
    prompt = f"""You are the AI patient coordinator for {clinic_name} on WhatsApp.
Your goal is to build rapport, answer the user's questions, and gently guide them toward providing the information we need to quote them.

CRITICAL SALES RULE (Acknowledge -> Answer -> Pivot):
1. ALWAYS start by warmly acknowledging what the user just said or asked.
2. If they asked a direct question (e.g. 'how much is it?'), answer only with verified clinic information. If no verified price is available, say staff can confirm it.
3. Finally, PIVOT gracefully by asking a conversational question to gather missing info.

The patient is currently missing: {missing_str}.
DO NOT aggressively demand an OPG X-ray in every message. Build trust first. If they are just asking general questions, answer them nicely and casually mention that a photo of their teeth would help give a precise quote."""

    prompt += "\n" + AI_IDENTITY_PROMPT + "\n" + HANDOFF_PROMPT

    if visual_analysis:
        prompt += f"""
IMPORTANT: The patient just sent an image. Our vision system analyzed it as: "{visual_analysis}".
- If the analysis confirms it IS a valid dental photo or X-ray, warmly THANK THEM for the clear image, and ONLY ask for the remaining missing info ({missing_str}).
- If the analysis shows an irrelevant object (like a laptop/dark frame), humorously point it out and ask for the teeth photo.
"""
    
    prompt += """\nKeep your response under 3 sentences unless business rules dictate otherwise."""



    # T24: Inject Tone and Business Rules
    agent_tone = state.get("agent_tone", "Professional and empathetic")
    business_rules = state.get("business_rules", "{}")
    prompt += f"\n\nPERSONA TONE: {agent_tone}\n"
    prompt += f"BUSINESS RULES: {business_rules}\n"

    if not state.get("is_compliant", True) and state.get("compliance_feedback"):
        prompt += "\n\nCRITICAL COMPLIANCE FEEDBACK ON PREVIOUS ATTEMPT: " + state.get("compliance_feedback") + "\nYou MUST fix this hallucination immediately."

    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    smart_writer_llm = _get_smart_llm()
    response = await smart_writer_llm.ainvoke(messages)
    
    new_messages = [response]
    node_updates = {"messages": new_messages, "current_stage": "QUALIFYING"}
    new_pending_actions = list(state.get("pending_crm_actions", []))
    
    if getattr(response, "tool_calls", None):
        messages.append(response)
        unverified = await _execute_tool_calls(
            state, response, messages, new_messages, new_pending_actions
        )
        if unverified:
            new_pending_actions.append(json.dumps({
                "action": "HANDOFF_TO_HUMAN",
                "payload": {"reason": "tool_result_unverified"},
            }))
            new_messages.append(AIMessage(content=SAFE_HANDOFF_MESSAGE))
        else:
            final_response = await LLMFactory.get_flagship_llm().ainvoke(messages)
            new_messages.append(final_response)

    if len(new_pending_actions) > len(state.get("pending_crm_actions", [])):
        node_updates["pending_crm_actions"] = new_pending_actions
        
    return node_updates

from langchain_core.messages import AIMessage
async def value_pitch_node(state: ConversationState):
    attempts = state.get("generation_attempts", 0)

    if not state.get("is_compliant", True) and attempts >= 2:
        from app.modules.agent.tools import escalate_to_human
        escalation_msg = await escalate_to_human.ainvoke({"reason": "AI failed compliance checks multiple times."}, config={"configurable": {"organization_id": state["organization_id"], "conversation_id": state["conversation_id"]}})
        current_actions = state.get("pending_crm_actions", [])
        new_actions = list(current_actions)
        new_actions.append(escalation_msg)
        safe_response = AIMessage(content=SAFE_HANDOFF_MESSAGE)
        return {"messages": [safe_response], "pending_crm_actions": new_actions, "current_stage": "HANDED_OFF", "is_compliant": True, "generation_attempts": 0}
    clinic_name = state.get("clinic_name", "our clinic")
    prompt = f"""You are the AI patient coordinator for {clinic_name}. The user is asking for pricing or service details.
    Use the search_clinic_knowledge tool to find real prices and info. NEVER invent prices. 
    Describe only verified service details and prices from the tool. Never imply pain-free treatment, a warranty, or a guaranteed outcome unless approved evidence explicitly supports it.
    Keep it conversational (WhatsApp style) and end with a Call-To-Action (e.g., free consultation check)."""
    
    prompt += "\n" + AI_IDENTITY_PROMPT + "\n" + HANDOFF_PROMPT
    

    # T24: Inject Tone and Business Rules
    agent_tone = state.get("agent_tone", "Professional and empathetic")
    business_rules = state.get("business_rules", "{}")
    prompt += f"\n\nPERSONA TONE: {agent_tone}\n"
    prompt += f"BUSINESS RULES: {business_rules}\n"

    if not state.get("is_compliant", True) and state.get("compliance_feedback"):
        prompt += "\n\nCRITICAL COMPLIANCE FEEDBACK ON PREVIOUS ATTEMPT: " + state.get("compliance_feedback") + "\nYou MUST fix this hallucination immediately."

    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    
    smart_writer_llm = _get_smart_llm()
    response = await smart_writer_llm.ainvoke(messages)
    
    new_messages = [response]
    node_updates = {"messages": new_messages, "current_stage": "VALUE_PITCH"}
    new_pending_actions = list(state.get("pending_crm_actions", []))
    
    if getattr(response, "tool_calls", None):
        messages.append(response)
        unverified = await _execute_tool_calls(
            state, response, messages, new_messages, new_pending_actions
        )
        if unverified:
            new_pending_actions.append(json.dumps({
                "action": "HANDOFF_TO_HUMAN",
                "payload": {"reason": "tool_result_unverified"},
            }))
            new_messages.append(AIMessage(content=SAFE_HANDOFF_MESSAGE))
        else:
            final_response = await LLMFactory.get_flagship_llm().ainvoke(messages)
            new_messages.append(final_response)

    if len(new_pending_actions) > len(state.get("pending_crm_actions", [])):
        node_updates["pending_crm_actions"] = new_pending_actions
        
    return node_updates

async def closing_node(state: ConversationState):
    attempts = state.get("generation_attempts", 0)

    if not state.get("is_compliant", True) and attempts >= 2:
        from app.modules.agent.tools import escalate_to_human
        escalation_msg = await escalate_to_human.ainvoke({"reason": "AI failed compliance checks multiple times."}, config={"configurable": {"organization_id": state["organization_id"], "conversation_id": state["conversation_id"]}})
        current_actions = state.get("pending_crm_actions", [])
        new_actions = list(current_actions)
        new_actions.append(escalation_msg)
        safe_response = AIMessage(content=SAFE_HANDOFF_MESSAGE)
        return {"messages": [safe_response], "pending_crm_actions": new_actions, "current_stage": "HANDED_OFF", "is_compliant": True, "generation_attempts": 0}

    clinic_name = state.get("clinic_name", "our clinic")
    prompt = f"""You are the AI patient coordinator for {clinic_name}. The user is ready to book or showing high intent. 
    Never invent urgency, availability, a discount, a price, a medical outcome, or a guarantee.
    Ask them explicitly for their preferred day and time for the consultation. 
    Keep it under 3 sentences, conversational (WhatsApp style), and extremely warm."""
    
    prompt += "\n" + AI_IDENTITY_PROMPT + "\n" + HANDOFF_PROMPT


    # T24: Inject Tone and Business Rules
    agent_tone = state.get("agent_tone", "Professional and empathetic")
    business_rules = state.get("business_rules", "{}")
    prompt += f"\n\nPERSONA TONE: {agent_tone}\n"
    prompt += f"BUSINESS RULES: {business_rules}\n"

    if not state.get("is_compliant", True) and state.get("compliance_feedback"):
        prompt += "\n\nCRITICAL COMPLIANCE FEEDBACK ON PREVIOUS ATTEMPT: " + state.get("compliance_feedback") + "\nYou MUST fix this hallucination immediately."
    
    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    smart_writer_llm = _get_smart_llm()
    response = await smart_writer_llm.ainvoke(messages)
    
    new_messages = [response]
    node_updates = {"messages": new_messages, "current_stage": "CLOSING"}
    new_pending_actions = list(state.get("pending_crm_actions", []))
    
    if getattr(response, "tool_calls", None):
        messages.append(response)
        unverified = await _execute_tool_calls(
            state, response, messages, new_messages, new_pending_actions
        )
        if unverified:
            new_pending_actions.append(json.dumps({
                "action": "HANDOFF_TO_HUMAN",
                "payload": {"reason": "tool_result_unverified"},
            }))
            new_messages.append(AIMessage(content=SAFE_HANDOFF_MESSAGE))
        else:
            final_response = await LLMFactory.get_flagship_llm().ainvoke(messages)
            new_messages.append(final_response)

    if len(new_pending_actions) > len(state.get("pending_crm_actions", [])):
        node_updates["pending_crm_actions"] = new_pending_actions
        
    return node_updates

async def out_of_domain_node(state: ConversationState):
    prompt = OUT_OF_DOMAIN_PROMPT
    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    flagship_llm = LLMFactory.get_flagship_llm()
    response = await flagship_llm.ainvoke(messages)
    return {"messages": [response], "current_stage": "OUT_OF_DOMAIN"}

from langchain_core.messages import AIMessage
async def general_qa_node(state: ConversationState):
    attempts = state.get("generation_attempts", 0)

    if not state.get("is_compliant", True) and attempts >= 2:
        from app.modules.agent.tools import escalate_to_human
        escalation_msg = await escalate_to_human.ainvoke({"reason": "AI failed compliance checks multiple times."}, config={"configurable": {"organization_id": state["organization_id"], "conversation_id": state["conversation_id"]}})
        current_actions = state.get("pending_crm_actions", [])
        new_actions = list(current_actions)
        new_actions.append(escalation_msg)
        safe_response = AIMessage(content=SAFE_HANDOFF_MESSAGE)
        return {"messages": [safe_response], "pending_crm_actions": new_actions, "current_stage": "HANDED_OFF", "is_compliant": True, "generation_attempts": 0}
    clinic_name = state.get("clinic_name", "our clinic")
    prompt = f"""You are the AI patient coordinator for {clinic_name}. The user is asking general questions about the clinic, doctors, location, or procedures.
    Use the search_clinic_knowledge tool to find accurate information. NEVER invent details. 
    Keep your response friendly, concise, and conversational (WhatsApp style). End by asking if they have any other questions or if they'd like to book a consultation."""
    
    prompt += "\n" + AI_IDENTITY_PROMPT + "\n" + HANDOFF_PROMPT
    

    # T24: Inject Tone and Business Rules
    agent_tone = state.get("agent_tone", "Professional and empathetic")
    business_rules = state.get("business_rules", "{}")
    prompt += f"\n\nPERSONA TONE: {agent_tone}\n"
    prompt += f"BUSINESS RULES: {business_rules}\n"

    if not state.get("is_compliant", True) and state.get("compliance_feedback"):
        prompt += "\n\nCRITICAL COMPLIANCE FEEDBACK ON PREVIOUS ATTEMPT: " + state.get("compliance_feedback") + "\nYou MUST fix this hallucination immediately."

    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    
    smart_writer_llm = _get_smart_llm()
    response = await smart_writer_llm.ainvoke(messages)
    new_messages = [response]
    node_updates = {"messages": new_messages, "current_stage": "GENERAL_QA"}
    new_pending_actions = list(state.get("pending_crm_actions", []))
    
    if getattr(response, "tool_calls", None):
        messages.append(response)
        unverified = await _execute_tool_calls(
            state, response, messages, new_messages, new_pending_actions
        )
        if unverified:
            new_pending_actions.append(json.dumps({
                "action": "HANDOFF_TO_HUMAN",
                "payload": {"reason": "tool_result_unverified"},
            }))
            new_messages.append(AIMessage(content=SAFE_HANDOFF_MESSAGE))
        else:
            final_response = await LLMFactory.get_flagship_llm().ainvoke(messages)
            new_messages.append(final_response)

    if len(new_pending_actions) > len(state.get("pending_crm_actions", [])):
        node_updates["pending_crm_actions"] = new_pending_actions
        
    return node_updates

async def summarizer_node(state: ConversationState):
    prompt = SUMMARIZER_PROMPT
    messages = [SystemMessage(content=prompt)] + list(state.get("messages", []))
    extractor_llm = LLMFactory.get_extractor_llm()
    response = await extractor_llm.ainvoke(messages)
    
    new_summary = response.content
    
    current_actions = state.get("pending_crm_actions", [])
    new_actions = list(current_actions)
    new_actions.append(json.dumps({
        "action": "UPDATE_SUMMARY",
        "payload": {"summary": new_summary}
    }))
    
    return {"pending_crm_actions": new_actions}

async def compliance_checker_node(state: ConversationState):
    # Only check if the last message is from the AI
    messages = state.get("messages", [])
    if not messages or getattr(messages[-1], "type", "") != "ai":
        return {"is_compliant": True}

    prompt = COMPLIANCE_CHECKER_PROMPT
    checker_messages = [SystemMessage(content=prompt)] + list(messages)
    
    cheap_llm = LLMFactory.get_cheap_llm()
    checker = cheap_llm.with_structured_output(ComplianceOutput)
    response = await checker.ainvoke(checker_messages)
    
    if response.is_compliant:
        return {"is_compliant": True, "compliance_feedback": None, "generation_attempts": 0}
    else:
        attempts = state.get("generation_attempts", 0) + 1
        return {
            "is_compliant": False, 
            "compliance_feedback": response.feedback, 
            "generation_attempts": attempts
        }
