
---

# Product Strategy & Vision: OmniDesk AI

**Document Status:** V2.0 (Updated Vision)
**Product Wedge:** Dental Clinics (Istanbul)
**Long-Term Vision:** AI Sales Employee OS for Enterprise

---

## 1. الرؤية والهدف الأساسي (Vision & Mission)

نحن لا نبني مجرد "Chatbot" لخدمة العملاء. نحن نبني **"نظام تشغيل لموظف المبيعات" (AI Sales Employee OS)**.
الهدف هو توفير وكيل مبيعات ذكي (Sales Agent) يعمل 24/7، يفهم لغات متعددة، مؤهل للتعامل مع الاعتراضات البيعية، ويدمج بسلاسة مع أي نظام خلفي للعميل.
نبدأ بقطاع **عيادات الأسنان (Dental Clinics)** كنقطة اختراق (Wedge)، وبمجرد إثبات النجاح، يتم توسيع نفس المحرك (Core Engine) لقطاعات أخرى (عقارات، قانون، الخ) عبر تغيير الإعدادات فقط (Configuration).

---

## 2. المعمارية الهندسية وفصل الاعتمادية (Architecture & Integration Layer)

الـ AI لن يتم ربطه بشكل مباشر ومقفل (Hardcoded) بأي CRM خارجي مثل HubSpot أو Zoho. الاعتمادية التامة ستكون على نظامنا الداخلي.

**التدفق المعماري (Traffic Flow):**
`WhatsApp -> AI Agent -> Our Internal Lead System -> Integration Layer -> External CRM`

* **Our Internal Lead System:** هو المصدر الأساسي للحقيقة (Source of Truth). يمتلك الـ Canonical Record لكل مريض (الاسم، الهاتف، النية، الحالة).
* **Integration Layer:** طبقة تعمل في الخلفية لمزامنة الـ State الداخلي مع الـ CRM الخاص بالعيادة (عبر OAuth) وربط `our_lead_id` مع `external_crm_id`.
* **فائدة الـ MVP:** إذا لم تمتلك العيادة CRM، يمكنها استخدام لوحة التحكم الخاصة بنا (Next.js Dashboard) لإدارة المرضى مباشرة، مما يسرع عملية إغلاق الصفقات مع أول عملائنا.

---

## 3. ذكاء المحادثة (Stateful Conversation & Intent)

لا يعتمد النظام على قراءة الرسالة الأخيرة فقط، بل يعتمد على محرك حالة (State Engine) يفصل تماماً بين **مرحلة المبيعات (Lifecycle)** وبين **طبيعة العميل (Intent / Attributes)**.

| نوع الحالة | الشرح | أمثلة عملية |
| --- | --- | --- |
| **Lifecycle State** | أين العميل في مسار المبيعات؟ (Pipeline) | `NEW`, `QUALIFIED`, `READY_TO_BOOK`, `HANDED_OFF`, `LOST` |
| **User Intent** | ماذا يريد العميل الآن؟ وما هي صفاته؟ | `PRICE_OBJECTION`, `MEDICAL_FEAR`, `LOGISTICS_INQUIRY` |

**القاعدة الذهبية:** الـ AI لا يغير الـ Lifecycle State بناءً على "تخمين"، بل يحتاج إلى حدث واضح (Trigger) مثل موافقة العميل على حجز موعد لتغيير الحالة إلى `READY_TO_BOOK`.

---

## 4. محرك قواعد العمل (Configurable Business Rules)

لتجنب تحويل كل عميل إلى مشروع برمجي منفصل (Custom Development)، سيتم إدارة مسارات الـ AI عبر إعدادات (Configuration) خاصة بكل عمل تجاري:

* **Identity:** شخصية الوكيل (الاسم، نبرة الصوت، فاخر أو ودود).
* **Knowledge Base (RAG):** الأسعار، الخدمات، أسماء الأطباء، ومواقع الفروع.
* **Business Rules (JSON Config):**
* *إذا الخدمة = زراعة أسنان* ➔ *اطلب صورة بانورامية (OPG).*
* *إذا البلد = أمريكا* ➔ *اعرض باقة الفندق والطيران.*



*في مرحلة الـ MVP، ستمرر هذه القواعد كـ JSON داخل الـ System Prompts للمسارات الأساسية (Hardcoded Routing).*

---

## 5. الحماية الطبية وصلاحيات النظام (Medical Safety & Guardrails)

بما أننا نتعامل مع قطاع طبي، الثقة والموثوقية (Reliability) أهم من الذكاء المطلق (Intelligence).

* **No Evidence -> No Claim:** إذا لم تتوفر المعلومة في الـ Knowledge Base (RAG)، يعتذر الوكيل بلباقة ("سأتأكد من الفريق الطبي") ولا يخترع سعراً.
* **لا للتشخيص الطبي:** ممنوع إعطاء نصيحة طبية أو ضمان نجاح طبي.
* **فصل الصلاحيات (RBAC for AI):** الـ AI مسموح له بجمع البيانات والرد على الأسئلة، لكنه **لا يستطيع** إرسال روابط دفع أو تغيير أسعار مسجلة، بل يسلمها للبشر.

---

## 6. التسليم البشري من الدرجة الأولى (First-Class Human Handoff)

ميزة الـ Handoff ليست مجرد إشعار "حدث خطأ". هي ميزة بيعية أساسية (Kill Switch) تُفعّل في حالات: (الغضب، الطلب المباشر للإنسان، الوصول لمرحلة الدفع، الأسئلة الطبية المعقدة).

**عند التسليم، يتلقى الموظف بطاقة ملخصة تشمل:**

* **العميل:** الاسم، العمر، البلد.
* **الخدمة:** نوع العلاج المطلوب.
* **النية (Intent):** (مثال: Price-sensitive).
* **سبب التسليم:** (مثال: Ready to pay / Requires medical review).

---

## 7. اقتصاديات التشغيل والتحليلات (Unit Economics & Analytics)

لضمان ربحية المنتج (ROI) لنا وللعيادة:

* **تكلفة الـ Lead:** تتبع تكلفة استدعاءات الـ LLM لكل مريض. استخدام نماذج سريعة ورخيصة (`gpt-4o-mini`) للتصنيف (Classification)، ونماذج أعمق للـ RAG.
* **تحليلات المبيعات:** توثيق مقاييس الأداء البيعي للعيادة (مثال: *قبل النظام X Leads، بعد النظام Y Booked Appointments*).

---

## 8. الأمان والخصوصية (Security & Privacy)

بيانات المرضى حساسة للغاية وتتطلب معايير صارمة:

* **Audit Logs:** سجل دقيق يوضح: ماذا قال العميل؟ ماذا فهم الـ AI؟ أي قاعدة (Rule) تم تطبيقها؟ ולماذا تم اتخاذ القرار؟ (مهم جداً لتبرير تصرفات النظام لأصحاب العيادات).
* **Data Retention:** الحد الأدنى من الاحتفاظ بالبيانات الحساسة، وإدارة آمنة للـ Secrets.
* **Idempotency:** منع إنشاء نفس العميل مرتين في حال تكرار الـ Webhooks من WhatsApp.

---

## 9. قوانين تنفيذ الـ MVP (MVP Execution Rules)

لتجنب الإفراط الهندسي (Premature Optimization):

1. **Reliability > Intelligence** (الموثوقية أولاً).
2. **Workflow > Prompt** (مسار عمل واضح أهم من أمر برمجي ضخم).
3. **Evidence > Assumptions** (لا افتراضات من خارج الـ Knowledge Base).
4. **Human handoff > Pretending AI is perfect** (الاستعانة بالبشر أفضل من ادعاء كمال الذكاء الاصطناعي).
5. **First customer > Beautiful architecture** (تشغيل النظام لأول عميل حقيقي أهم من بناء معمارية خيالية الآن).

---