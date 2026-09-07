from app.modules.agent.state import ConversationState
from langgraph.graph import END

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

def after_sales_router(state: ConversationState) -> str:
    if state.get("needs_summarization"):
        return "summarizer_node"
    return END
