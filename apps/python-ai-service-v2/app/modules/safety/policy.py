"""Deterministic safety policy for all customer-facing AI delivery.

This module deliberately contains no model calls: it is used both before the
LangGraph is invoked and immediately before a reply is returned to NestJS.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


# DRAFT patient copy pending founder/clinic review (F02), especially Turkish.
# Rules: say why truthfully (a person was asked for vs. the AI can't answer
# safely vs. a technical problem), never promise when staff will reply.
HANDOFF_MESSAGES = {
    "human_request": {
        "en": "I'm the clinic's AI assistant. Of course, I'm passing your request to the clinic's team, and a team member will reply to you here.",
        "tr": "Ben kliniğin yapay zekâ asistanıyım. Elbette, talebinizi kliniğin ekibine iletiyorum; bir ekip üyemiz size buradan yanıt verecek.",
    },
    "cannot_answer": {
        "en": "I'm the clinic's AI assistant and I can't safely answer that here. I'm passing your question to the clinic's team, and a team member will reply to you here.",
        "tr": "Ben kliniğin yapay zekâ asistanıyım ve bu soruyu burada güvenli şekilde yanıtlayamam. Sorunuzu kliniğin ekibine iletiyorum; bir ekip üyemiz size buradan yanıt verecek.",
    },
    "technical": {
        "en": "Sorry, I couldn't process your message. I'm passing it to the clinic's team, and a team member will reply to you here.",
        "tr": "Üzgünüm, mesajınızı işleyemedim. Mesajınızı kliniğin ekibine iletiyorum; bir ekip üyemiz size buradan yanıt verecek.",
    },
}

APPOINTMENT_REQUEST_MESSAGES = {
    "en": "Your request is noted. The clinic team will confirm the time.",
    "tr": "Talebiniz not edildi. Saatini klinik ekibi teyit edecek.",
    "ar": "تم تسجيل طلبك. سيؤكد فريق العيادة الوقت.",
}

# Default (English, can't-answer-safely). Graph nodes emit this as a sentinel;
# the servicer localizes it before delivery.
SAFE_HANDOFF_MESSAGE = HANDOFF_MESSAGES["cannot_answer"]["en"]

_TURKISH_CHARS = re.compile(r"[çğıöşüÇĞİÖŞÜ]")
_TURKISH_WORDS = re.compile(
    r"\b(?:merhaba|selam|fiyat\w*|istiyorum|lütfen|teşekkür\w*|tesekkur\w*|randevu\w*|"
    r"nasıl|nedir|kadar|evet|hayır|musunuz|misiniz|mısınız|mi|mı|ne)\b",
    re.IGNORECASE,
)


def detect_language(text: str | None) -> str:
    """Pick 'tr' or 'en' for handoff copy from the patient's latest text."""
    value = str(text or "")
    if _TURKISH_CHARS.search(value) or len(_TURKISH_WORDS.findall(value)) >= 2:
        return "tr"
    return "en"


def handoff_message(kind: str, language: str = "en") -> str:
    messages = HANDOFF_MESSAGES.get(kind, HANDOFF_MESSAGES["cannot_answer"])
    return messages.get(language, messages["en"])


def handoff_kind(reason: str | None) -> str:
    """Map a policy/servicer block reason to the matching patient message."""
    if reason == "human_handoff_request":
        return "human_request"
    if reason in {"incompatible_contract_version", "system_exception", "tool_failure", "turn_deadline_exceeded"}:
        return "technical"
    return "cannot_answer"


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
        "appointment_confirmation": (
            r"\b(?:your|the|this)\s+(?:appointment|booking|consultation|slot)\s+(?:is|has been|was)\s+(?:confirmed|booked|scheduled|reserved)\b|"
            r"\b(?:i|we)(?:'ve| have)?\s+(?:confirmed|booked|scheduled|reserved)\s+(?:your|the|you)\b|"
            r"\byou(?:['’]re| are| have been)\s+(?:booked|scheduled|confirmed|reserved)\b|"
            r"\b(?:appointment|booking|consultation)\s+confirmed\b|"
            r"\b(?:randevu|rezervasyon)\w*\s+(?:(?:başarıyla|kesin olarak)\s+)?(?:onaylandı|onaylanmıştır|onaylı|kesinleşti|kesinleşmiştir|ayarlanmıştır|ayarlandı)\b|"
            r"\brandevu\w*.{0,30}(?:onayladık|onayladım|ayarladık|ayarladım)\b|"
            r"(?:تم|لقد تم)\s+(?:تأكيد|حجز|تثبيت)\s+(?:موعد|حجز)|"
            r"(?:موعدك|حجزك|الموعد|الحجز)\s+(?:مؤكد|محجوز|تم تأكيده)|"
            r"(?:أكدنا|حجزنا)\s+(?:موعدك|لك موعد)"
        ),
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
