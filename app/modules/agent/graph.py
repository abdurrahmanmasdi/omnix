import os
from typing import Literal
from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI
from app.modules.agent.state import AgentState
from app.modules.agent.tools import tools_list, search_clinic_knowledge, sync_lead_crm, fetch_social_proof
from app.core.config import settings
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode


# 1. Initialize the LLMs (Precision Hybrid Strategy)
# gpt-5.4-nano: Ultra-cheap, used for initial greeting and simple discovery
nano_llm = ChatOpenAI(
    model="gpt-5.4-nano",
    api_key=settings.OPENAI_API_KEY,
    temperature=0.2
)

# gpt-5.4: Flagship model for high-stakes medical sales, RAG accuracy, and complex reasoning.
# We use this for Nurturer and Closer to ensure NO information is missed.
flagship_llm = ChatOpenAI(
    model="gpt-5.4",
    api_key=settings.OPENAI_API_KEY,
    temperature=0.2
)

# 2. 🚀 Restrict Tools by Node (Security & Token Savings)
qualifier_llm = nano_llm.bind_tools([sync_lead_crm])
nurturer_llm = flagship_llm.bind_tools([sync_lead_crm, search_clinic_knowledge, fetch_social_proof])
closer_llm = flagship_llm.bind_tools([sync_lead_crm])

# --- NODE 1: THE QUALIFIER (Digital Assistant - Discovery) ---
async def qualifier_node(state: AgentState):
    prompt = f"""
    You are the Senior Digital Assistant for a premium medical clinic in Istanbul. 
    Patient: {state.get('first_name', 'Unknown')} from {state.get('country', 'Unknown')}.
    
    TONE: Professional, empathetic, and welcoming. Speak like a high-end concierge.
    
    MISSION: 
    1. Welcome them warmly and acknowledge their interest in a life-changing procedure.
    2. Ask 1-2 polite discovery questions about their medical goals (e.g., "What specific areas are you looking to improve?").
    3. NEVER mention specific prices yet—focus on their needs.
    4. QUALIFICATION: If they are under 18 or asking for non-medical services, politely inform them we cannot assist and use 'sync_lead_crm' to set status to 'UNQUALIFIED'.
    5. SUCCESS: Once they share their goals, use 'sync_lead_crm' to set status to 'QUALIFYING' and priority to 'WARM'.
    """
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await qualifier_llm.ainvoke(messages)
    return {"messages": [response], "sender": "qualifier"}

# --- NODE 2: THE NURTURER (Digital Assistant - Consultant) ---
async def nurturer_node(state: AgentState):
    prompt = f"""
    You are the Senior Medical Consultant (Digital Assistant). 
    Patient: {state.get('first_name', 'Unknown')} from {state.get('country', 'Unknown')}.
    
    TONE: Reassuring, expert, and transparent. Your goal is to build absolute trust.
    
    MISSION:
    1. ANSWER: Use 'search_clinic_knowledge' to answer every technical or logistical question.
    2. REASSURE: If they show ANY fear, hesitation, or doubt (e.g., pain, travel, results), use 'fetch_social_proof' immediately. Mention that you've helped others with similar concerns.
    3. LANGUAGE: Continue the conversation in the patient's language naturally.
    4. HANDOFF TRIGGER: If they mention severe medical conditions, use 'sync_lead_crm' to set status to 'HANDED_OFF' and tell them a head doctor will review their file personally.
    5. SUCCESS: If they ask "How do I book?" or "What's the next step?", use 'sync_lead_crm' to set status to 'READY_TO_PAY' and priority to 'HOT'.
    """
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await nurturer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "nurturer"}

# --- NODE 3: THE CLOSER (Digital Assistant - Concierge) ---
async def closer_node(state: AgentState):
    prompt = f"""
    You are the Booking Coordinator (Digital Assistant). 
    Patient: {state.get('first_name', 'Unknown')} from {state.get('country', 'Unknown')}.
    
    TONE: Efficient, helpful, and high-energy. Assume the sale is already made.
    
    MISSION:
    1. LOGISTICS: Ask for passport details for the hotel booking or explain the payment wire process.
    2. THE WARM HANDOFF: Tell them: "I've prepared your file. My colleague [Human Name] will now give you a quick call or message to finalize the dates and answer any final personal questions."
    3. CRITICAL: Once this is done, use 'sync_lead_crm' to set status to 'HANDED_OFF'.
    4. Do NOT give new medical advice. Just help them cross the finish line.
    """
    messages = [SystemMessage(content=prompt)] + state["messages"]
    response = await closer_llm.ainvoke(messages)
    return {"messages": [response], "sender": "closer"}

# --- ROUTERS ---

def initial_router(state: AgentState) -> Literal["qualifier", "nurturer", "closer", "sleep"]:
    """Reads the database state and routes to the correct specialist."""
    
    status = state.get("lead_status", "NEW")
    priority = state.get("lead_priority", "COLD")
    
    # 🛑 1. THE ZOMBIE GUARDRAIL
    # If the lead is in a terminal state, the AI must not talk.
    if status in ["WON", "LOST", "UNQUALIFIED", "HANDED_OFF"]:
        return "sleep" # We will create a dummy node that just ends the graph
    
    # 🟢 2. THE CLOSER
    if status == "READY_TO_PAY" or priority == "HOT":
        return "closer"
        
    # 🟡 3. THE NURTURER
    if status == "QUALIFYING" or priority == "WARM":
        return "nurturer"
        
    # 🔵 4. THE QUALIFIER
    return "qualifier"

# Create a dummy sleep node that does nothing, so the AI stays quiet
def sleep_node(state: AgentState):
    print("💤 [AI is Sleeping] Lead is in a terminal state (WON/LOST/HANDED_OFF/UNQUALIFIED).")
    # Return a system message that your main.py can intercept and NOT send to WhatsApp
    return {"messages": [SystemMessage(content="[SYSTEM: DO_NOT_SEND_REPLY]")], "sender": "sleep"}

def tool_router(state: AgentState) -> Literal["tools", END]:
    """If the LLM called a tool, go to tools. Otherwise, end the turn and send to WhatsApp."""
    if state["messages"][-1].tool_calls:
        return "tools"
    return END

def route_after_tool(state: AgentState) -> str:
    """Sends the tool result back to whichever agent asked for it."""
    return state["sender"]

# --- BUILD THE GRAPH ---
builder = StateGraph(AgentState)

# Add Nodes
builder.add_node("qualifier", qualifier_node)
builder.add_node("nurturer", nurturer_node)
builder.add_node("closer", closer_node)
builder.add_node("tools", ToolNode(tools_list))

# Flow Logic
builder.add_node("sleep", sleep_node)
builder.add_conditional_edges(START, initial_router)
builder.add_edge("sleep", END)

builder.add_conditional_edges("qualifier", tool_router) # 2a. Did Qualifier use a tool?
builder.add_conditional_edges("nurturer", tool_router)  # 2b. Did Nurturer use a tool?
builder.add_conditional_edges("closer", tool_router)    # 2c. Did Closer use a tool?

builder.add_conditional_edges("tools", route_after_tool) # 3. Send tool result back to the specific agent

agent_app = builder.compile()