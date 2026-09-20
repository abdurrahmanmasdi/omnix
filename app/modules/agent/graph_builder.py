from langgraph.graph import StateGraph, START, END
from app.modules.agent.state import ConversationState
from app.modules.agent.nodes import (
    extract_and_classify, objection_handler_node, qualification_node, 
    value_pitch_node, closing_node, general_qa_node, out_of_domain_node, summarizer_node, compliance_checker_node
)
from app.modules.agent.edges import sales_router, after_sales_router, compliance_router

def build_graph():
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
    builder.add_node("compliance_checker_node", compliance_checker_node)

    # Flow Logic
    builder.add_edge(START, "extract_and_classify")
    builder.add_conditional_edges("extract_and_classify", sales_router)

    # Out of domain bypasses compliance check
    for node in ["out_of_domain_node"]:
        builder.add_conditional_edges(node, after_sales_router)
        
    # All other AI response nodes must go through the compliance checker
    for node in ["qualification_node", "closing_node", "objection_handler_node", "value_pitch_node", "general_qa_node"]:
        builder.add_edge(node, "compliance_checker_node")
        
    builder.add_conditional_edges("compliance_checker_node", compliance_router)

    builder.add_edge("summarizer_node", END)

    # Compile
    return builder.compile()

agent_app = build_graph()
