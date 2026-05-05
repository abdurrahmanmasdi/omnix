from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
import operator

class AgentState(TypedDict):
    # 'messages' holds the chat history. 
    # The 'operator.add' tells LangGraph to append new messages rather than overwrite them.
    messages: Annotated[Sequence[BaseMessage], operator.add]
    
    # Context variables
    organization_id: str
    conversation_id: str
    patient_phone: str
    
    # CRM Variables (This replaces your rigid if/else router!)
    # By tracking this in the state, we can dynamically change the System Prompt
    lead_priority: str # e.g., "COLD" (exploration), "WARM" (objection), "HOT" (closing)