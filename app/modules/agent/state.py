from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
import operator

class AgentState(TypedDict):
    # Chat History
    messages: Annotated[Sequence[BaseMessage], operator.add]
    
    # CRM Data
    organization_id: str
    conversation_id: str
    lead_id: str | None
    first_name: str
    last_name: str | None
    phone_number: str
    gender: str
    country: str
    lead_status: str
    lead_priority: str
    
    # AI Routing Data (Added for V3)
    user_intent: str
    user_language: str
    sender: str
    
    # Dynamic Configuration
    clinic_name: str
    agent_tone: str
    business_rules: str
    
    # Deterministic Workflow State
    is_name_collected: bool
    is_service_identified: bool
    has_medical_evidence: bool