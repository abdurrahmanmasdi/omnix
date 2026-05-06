import os
from typing import Literal
from langchain_core.messages import SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from app.core.config import settings

from app.modules.agent.state import AgentState
from app.modules.agent.tools import tools_list


# 1. Initialize the LLM (Gemini 2.5 Flash)
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    api_key=settings.Gemini_API_KEY,
    temperature=0.2 # Low temperature keeps the AI factual and focused on sales
)

# Bind the tools so Gemini knows what "hands" it has available
llm_with_tools = llm.bind_tools(tools_list)

# 2. Define the Assistant Node (The Brain)
async def assistant_node(state: AgentState):
    # 🚀 Here is the "Product Manager Prompt" we discussed!
    # It reads the exact status from your Prisma Database state.
    system_prompt = f"""
    You are a top-tier medical tourism sales agent for a clinic.
    
    PATIENT INFO:
    Name: {state.get("first_name", "Unknown")}
    Country: {state.get("country", "Unknown")}
    
    CURRENT CRM STATE:
    Status: {state.get("lead_status", "NEW")}
    Priority: {state.get("lead_priority", "COLD")}
    
    YOUR DIRECTIVES BASED ON CRM STATE:
    - If Status is NEW or QUALIFYING (Priority COLD): Focus on building trust. Ask 1 or 2 questions about their medical needs. DO NOT push prices heavily. Use the 'search_clinic_knowledge' tool if they ask about procedures.
    - If Priority is WARM: Provide clear, factual answers using your tools. Highlight the quality of the clinic and start suggesting a consultation.
    - If Status is READY_TO_PAY or Priority is HOT: Be assertive. Assume the sale. Ask them to confirm their booking dates or preferred payment currency.
    
    CRITICAL RULES:
    1. Reply in the exact same language the user speaks.
    2. Keep answers concise for WhatsApp.
    3. NEVER invent prices. Always use your knowledge tool.
    4. If the user expresses readiness to buy or shares their name/country, immediately use the 'sync_lead_crm' tool to update their profile.
    """
    
    # Prepend the system prompt to the chat history
    messages = [SystemMessage(content=system_prompt)] + state["messages"]
    
    # Call Gemini
    response = await llm_with_tools.ainvoke(messages)
    
    # Return the AI's reply to be appended to the state
    return {"messages": [response]}

# 3. Define the Router Logic
def should_continue(state: AgentState) -> Literal["tools", END]: # type: ignore
    """Decides if the AI wants to use a tool or send the final message to WhatsApp."""
    last_message = state["messages"][-1]
    
    # If Gemini decided it needs to search the DB or update the CRM, route to "tools"
    if last_message.tool_calls:
        return "tools"
    
    # Otherwise, it wrote a normal text reply. Route to END to send it.
    return END

# 4. Build and Compile the Graph!
builder = StateGraph(AgentState)

# Add our two departments
builder.add_node("assistant", assistant_node)
builder.add_node("tools", ToolNode(tools_list))

# Draw the flowchart
builder.add_edge(START, "assistant")             # Step 1: User message goes to Assistant
builder.add_conditional_edges("assistant", should_continue) # Step 2: Assistant decides -> Tool or End?
builder.add_edge("tools", "assistant")           # Step 3: Tool finishes -> Back to Assistant to read the result

# Compile it into a runnable application
agent_app = builder.compile()