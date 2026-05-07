import operator
from typing import Annotated, TypedDict, Sequence
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    # Chat History
    messages: Annotated[Sequence[BaseMessage], operator.add]
    
    # Core IDs
    organization_id: str
    conversation_id: str
    lead_id: str | None # Might be None if it's a brand new WhatsApp number
    
    # The AI's Cognitive Variables (Directly from your Prisma Enums)
    first_name: str
    country: str
    lead_status: str # "NEW", "QUALIFYING", "READY_TO_PAY", "HANDED_OFF"
    lead_priority: str # "COLD", "WARM", "HOT"

    # 🚀 NEW: Tracks which specific node called a tool, so we can route back to it
    sender: str