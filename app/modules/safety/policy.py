"""Deterministic safety policy for all customer-facing AI delivery.

This module deliberately contains no model calls: it is used both before the
LangGraph is invoked and immediately before a reply is returned to NestJS.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


SAFE_HANDOFF_MESSAGE = (
    "I can't safely answer that here. A human medical coordinator can help "
    "you with accurate information."
)


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    reason: str | None = None


class DeliverySafetyPolicy:
    """Conservative, explainable delivery guardrails (fail closed)."""

    # Instruction override/jailbreak attempts must never reach an LLM prompt.
    # Human-handoff and medical patterns match explicit requests only: ordinary
    # questions ("can you help me book?", "do I have to pay a deposit?",
    # "Yardımcı olur musunuz?") must not end AI service (KI-047). Semantic
    # intent classification is Phase 3; keep these regexes narrow.
    INPUT_PATTERNS = {
        "prompt_injection": r"(?:ignore|disregard|override|forget).{0,80}(?:previous|prior|above|system|developer|instruction|rules|prompt)|"
        r"(?:reveal|show|print|repeat).{0,40}(?:system prompt|developer message|your (?:instructions|prompt|rules))|"
        r"(?:system prompt|developer message|jailbreak|do anything now)|"
        r"(?:talimat|kural)\w*.{0,40}(?:yok say|görmezden gel|unut)",
        "human_handoff_request": r"\b(?:human|real person|live (?:agent|person)|operator|supervisor|representative)\b|"
        r"\b(?:speak|talk|chat)\s+(?:to|with)\s+(?:(?:a|an|the|your|some)\s+)?"
        r"(?:person|someone|somebody|agent|doctor|dentist|manager|staff|coordinator|team member|customer service)\b|"
        r"\b(?:connect|transfer|put)\s+me\s+(?:through\s+)?(?:to|with)\b|"
        r"\binsan(?:la|a)\b|\bbiri(?:yle|siyle)\s+(?:görüş|konuş)|\byetkili\w*|\btemsilci\w*|"
        r"\bgerçek\s+bir\s+(?:kişi|insan)\w*|\b(?:doktor|hekim|koordinatör)\w*\s+(?:görüş|konuş)",
        "medical_diagnosis_request": r"\b(?:diagnose|what(?:'s| is) wrong with|is it broken|is this infected|how do i treat|what should i take|"
        r"do i have (?:an? )?(?:infection|abscess|cavity|cavities|disease|cancer|gum disease)|"
        r"can you check my (?:teeth|tooth|gums?|x-?ray|photo|swelling|wound|implant))\b",
    }
    # A reply that includes any of these claims is unsafe unless it is replaced
    # by a coordinator handoff.  Do not depend on prompts/model self-reporting.
    OUTPUT_PATTERNS = {
        "guarantee": r"\b(?:guarantee(?:d)?|risk[- ]free|100%|always successful|permanent results?)\b",
        "unsupported_outcome_claim": r"\b(?:many successful cases|high success rate|premium quality|best clinic|top[- ]rated)\b",
        "medical_diagnosis_or_treatment": r"\b(?:diagnos(?:e|is)|prescri(?:be|ption)|dosage|take \d|infection|medication|you have (?:cancer|diabetes|disease|a condition|an infection)|you need (?:surgery|treatment|antibiotics|medicine)|you should (?:take|stop|avoid|rest))\b",
        "pii_or_secret_exfiltration": r"(?:data:image|base64|-----BEGIN|\b(?:api[_ -]?key|authorization|bearer token|password)\b)",
        "false_urgency_or_unauthorized_discount": r"\b(?:expires today|limited time|act now|only \d+ left|discount|% off|coupon|voucher|special offer|price drop|sale ends|buy now or)\b",
    }

    @classmethod
    def _check(cls, text: str, patterns: dict[str, str]) -> PolicyDecision:
        # Turkish dotted capital İ lower-cases to "i" + U+0307; fold it so
        # "İNSANLA" matches the same pattern as "insanla".
        normalized = " ".join(str(text or "").replace("İ", "i").lower().replace("\u0307", "").split())
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
