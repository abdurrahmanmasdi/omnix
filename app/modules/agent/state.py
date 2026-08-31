from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
import operator

# 1. Customer Facts (الحقائق المجردة للعميل)
class CustomerData(TypedDict, total=False):
    name: str | None
    phone: str | None
    country: str | None
    service_interested: str | None
    is_medical_evidence_provided: bool

# 2. The Global State (حالة المحادثة الكاملة)
class ConversationState(TypedDict):
    # Chat History (يتم تجميع الرسائل هنا)
    messages: Annotated[Sequence[BaseMessage], operator.add]
    
    # Context & IDs
    organization_id: str
    conversation_id: str
    lead_id: str | None
    
    # Customer Facts
    customer: CustomerData
    
    # Sales Intelligence (عقل المبيعات)
    current_intent: str | None       # نية العميل الحالية (مثال: ask_price, book_appointment)
    active_objection: str | None     # الاعتراض الحالي (مثال: too_expensive, fear_of_pain)
    visual_pixel_analysis: str | None
    
    # Workflow Execution (التوجيه)
    current_stage: str | None        # أين نحن في مسار المبيعات؟ (مثال: QUALIFYING, PITCHING)
    pending_crm_actions: list[str]   # الإجراءات التي سيتم إرسالها لـ NestJS
