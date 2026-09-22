"""Deterministic safety policy for all customer-facing AI delivery.

This module deliberately contains no model calls: it is used both before the
LangGraph is invoked and immediately before a reply is returned to NestJS.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


SAFE_HANDOFF_MESSAGE = (
    "I’m connecting you with our human medical coordinator so they can help "
    "you safely and accurately. They will message you here shortly."
)


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    reason: str | None = None


class DeliverySafetyPolicy:
    """Conservative, explainable delivery guardrails (fail closed)."""

    # Instruction override/jailbreak attempts must never reach an LLM prompt.
    INPUT_PATTERNS = {
        "prompt_injection": r"(?:ignore|disregard|override|reveal|show).{0,80}(?:previous|prior|system|developer|instruction|prompt)|"
        r"(?:system prompt|developer message|jailbreak|do anything now)",
        "human_request": r"\b(?:human|real person|representative|agent|manager|doctor|coordinator)\b",
        "medical_advice": r"\b(?:diagnos(?:e|is)|prescri(?:be|ption)|dosage|dose|side effects?|post[- ]?op|infection|bleeding|swelling|pain medication)\b",
    }
    # A reply that includes any of these claims is unsafe unless it is replaced
    # by a coordinator handoff.  Do not depend on prompts/model self-reporting.
    OUTPUT_PATTERNS = {
        "guarantee": r"\b(?:guarantee(?:d)?|risk[- ]free|100%|always successful|permanent results?)\b",
        "fabricated_urgency_or_discount": r"\b(?:only \d+ slots?|slots? left|ending (?:today|tomorrow|soon)|limited[- ]time|special discount|discount ends?|act now|last chance)\b",
        "medical_diagnosis_or_treatment": r"\b(?:diagnos(?:e|is)|prescri(?:be|ption)|dosage|take \d|infection|medication|you have (?:cancer|diabetes|disease|a condition|an infection)|you need (?:surgery|treatment|antibiotics|medicine)|you should (?:take|stop|avoid|rest))\b",
        "pii_or_secret_exfiltration": r"(?:data:image|base64|-----BEGIN|\b(?:api[_ -]?key|authorization|bearer token|password)\b)",
    }

    @classmethod
    def _check(cls, text: str, patterns: dict[str, str]) -> PolicyDecision:
        normalized = " ".join(str(text or "").lower().split())
        for reason, pattern in patterns.items():
            if re.search(pattern, normalized, flags=re.IGNORECASE):
                return PolicyDecision(False, reason)
        return PolicyDecision(True)

    @classmethod
    def check_input(cls, text: str) -> PolicyDecision:
        return cls._check(text, cls.INPUT_PATTERNS)

    @classmethod
    def check_output(cls, text: str) -> PolicyDecision:
        return cls._check(text, cls.OUTPUT_PATTERNS)
