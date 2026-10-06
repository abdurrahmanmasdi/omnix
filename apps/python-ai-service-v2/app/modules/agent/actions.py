"""Validate virtual actions against the versioned Python/Nest contract."""

import json
import re
from datetime import datetime, timezone
from pathlib import Path


CONTRACT = json.loads(Path(__file__).with_name("agent-actions.v1.json").read_text())
CONTRACT_VERSION = CONTRACT["version"]
DATE_TIME = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})")


def parse_virtual_action(raw: str | dict) -> tuple[str, dict] | None:
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return None
    if not isinstance(value, dict) or set(value) - {"action", "payload", "parameters"}:
        return None
    action = value.get("action")
    spec = CONTRACT["actions"].get(action) if isinstance(action, str) else None
    if spec is None:
        return None
    payload = value.get("payload", value.get("parameters", {}))
    if not isinstance(payload, dict):
        return None
    fields = CONTRACT["actions"][spec["sameFieldsAs"]]["fields"] if "sameFieldsAs" in spec else spec["fields"]
    if (set(payload) - set(fields) or
            set(spec["required"]) - set(payload) or
            len(payload) < spec.get("minFields", 0) or
            len(json.dumps(payload)) > 16384):
        return None
    for key, field in payload.items():
        rule = fields[key]
        kind = rule["kind"]
        if kind == "string":
            if not isinstance(field, str) or not field.strip() or len(field) > rule["max"]:
                return None
        elif kind == "enum":
            if not isinstance(field, str) or field not in rule["values"]:
                return None
        elif kind == "date-time":
            if not isinstance(field, str) or not DATE_TIME.fullmatch(field):
                return None
            try:
                moment = datetime.fromisoformat(field.replace("Z", "+00:00"))
            except ValueError:
                return None
            if moment.tzinfo is None:
                return None
            # A follow-up in the past would fire immediately (KI-052).
            if action == "SCHEDULE_FOLLOW_UP" and moment <= datetime.now(timezone.utc):
                return None
    if action == "HANDOFF_TO_HUMAN":
        reason = payload.get("reason", "patient_requested")
        payload = {"reason": reason}
    return action, payload
