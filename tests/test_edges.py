import pytest
from app.modules.agent.edges import sales_router, after_sales_router
from langgraph.graph import END

def test_sales_router_out_of_domain():
    state = {"current_intent": "out_of_domain"}
    assert sales_router(state) == "out_of_domain_node"

def test_sales_router_objection():
    # Even if out of domain is not active, objection takes precedence over qualification
    state = {
        "active_objection": "price is too high",
        "customer": {"name": "John Doe", "is_medical_evidence_provided": True}
    }
    assert sales_router(state) == "objection_handler_node"

def test_sales_router_qualification_missing_name():
    state = {
        "active_objection": "none",
        "customer": {"is_medical_evidence_provided": True} # Missing name
    }
    assert sales_router(state) == "qualification_node"

def test_sales_router_qualification_missing_evidence():
    state = {
        "active_objection": "None",
        "customer": {"name": "John"} # Missing evidence
    }
    assert sales_router(state) == "qualification_node"

def test_sales_router_intent_booking():
    state = {
        "current_intent": "booking",
        "active_objection": None,
        "customer": {"name": "John", "is_medical_evidence_provided": True}
    }
    assert sales_router(state) == "closing_node"

def test_sales_router_intent_pricing():
    state = {
        "current_intent": "pricing",
        "active_objection": "None",
        "customer": {"name": "John", "is_medical_evidence_provided": True}
    }
    assert sales_router(state) == "value_pitch_node"

def test_sales_router_fallback():
    state = {
        "current_intent": "greeting",
        "active_objection": "",
        "customer": {"name": "John", "is_medical_evidence_provided": True}
    }
    assert sales_router(state) == "general_qa_node"

def test_after_sales_router_summarization():
    state = {"needs_summarization": True}
    assert after_sales_router(state) == "summarizer_node"

def test_after_sales_router_no_summarization():
    state = {"needs_summarization": False}
    assert after_sales_router(state) == END
