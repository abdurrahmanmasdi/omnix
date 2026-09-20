import asyncio
import pytest

from app.modules.safety.guardrails import SafetyService


@pytest.mark.parametrize("reply", [
    "Here is a normal booking answer.",
    "Please ask a coordinator for a secure link.",
])
def test_allows_normal_reply(reply):
    assert asyncio.run(SafetyService().verify_no_pii_leak(reply))


@pytest.mark.parametrize("reply", [
    "data:image/png;base64,iVBORw0KGgo=",
    "Do not include BASE64 image material in chat.",
])
def test_blocks_base64_or_data_url(reply):
    assert not asyncio.run(SafetyService().verify_no_pii_leak(reply))
