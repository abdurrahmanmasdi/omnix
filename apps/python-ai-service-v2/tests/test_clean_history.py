from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from app.modules.agent.nodes import clean_history


def call(i):
    return {"name": "escalate_to_human", "args": {}, "id": i, "type": "tool_call"}


def test_dangling_tool_call_is_dropped():
    history = [HumanMessage("price?"), AIMessage("", tool_calls=[call("a")]), AIMessage("A team member will reply.")]
    out = clean_history(history)
    assert [m.type for m in out] == ["human", "ai"]
    assert out[-1].content == "A team member will reply."


def test_complete_tool_exchange_is_kept():
    history = [HumanMessage("x"), AIMessage("", tool_calls=[call("a")]), ToolMessage("ok", tool_call_id="a"), AIMessage("done")]
    assert clean_history(history) == history


def test_partial_answers_drop_exchange_but_keep_text():
    history = [AIMessage("Let me check.", tool_calls=[call("a"), call("b")]), ToolMessage("ok", tool_call_id="a")]
    out = clean_history(history)
    assert len(out) == 1 and out[0].content == "Let me check." and not out[0].tool_calls


def test_orphan_tool_message_is_dropped():
    assert clean_history([ToolMessage("x", tool_call_id="z"), HumanMessage("hi")])[0].type == "human"
