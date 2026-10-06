# OmniX AI coordinator — research, sales playbook, design

_2026-10-06 · Claude (planner). Status: **proposed** — founder to approve. Goes to `docs/reference/product/` after M4; cards AI-1…AI-3 go into `docs/PLAN.md`._

## 1. Bottom line

1. Patients shop **3–4 clinics at the same time** and decide in **2–4 weeks**. The clinic that answers fast, clearly and calmly, without pressure, wins. Our AI can beat human coordinators on speed and consistency. That is the product.
2. Today's AI blocks the sale: it asks for a name and an X-ray before it answers anything (`edges.py`). Good coordinators do the opposite: **answer first, then ask one question.**
3. Build **one coordinator agent** with a written playbook, the clinic's fact sheet in the prompt, and a few tools. Keep our safety checks. This replaces the five routed "writer" steps.
4. **Measure with simulated patients** (an eval set) before and after every change. Without it we are guessing.
5. Get **real data** cheaply: you message 10 Istanbul clinics on WhatsApp as a patient (mystery shopping). That is also your best sales argument to those clinics.

## 2. How patients buy (research)

**Behavior**
- They message 3–4 clinics at once, across time zones, and decide over 2–4 weeks [Planports, vendor blog — treat the numbers as indicative].
- Speed matters: contacting a lead within 5 min vs 30 min makes qualification far more likely (HBR study, cited by Planports). One vendor claims clinics answering within 2 min convert 78% more. That's a marketing claim, unverified.
- Medical Tourism Association advice: treat the first contact as a **free initial consultation**, ask for photos or a questionnaire, set a concrete call time (don't ask them to call you), follow up a second time (most clinics skip it), then close politely after 7–10 days.

**What patients worry about** (MTA patient guide, Trustpilot reviews)
- "Turkey teeth": healthy teeth filed down for veneers. Patients want **conservative plans**.
- Hidden costs and price changes on arrival. They want an **itemized written quote**: each tooth, materials and brands, implant system, lab work.
- Quality and credentials: dentist experience, the Ministry of Health **International Health Tourism Authorization Certificate**, real before/after cases, real reviews.
- Aftercare after they fly home: warranty terms, what happens if an implant fails, a local dentist for follow-up.
- Logistics: how many days, two visits for implants (healing gap), flights, hotel, transfer, language support.

**What reviews praise vs. complain about**
- **Praise:** quick and clear WhatsApp answers; "answered all my many questions"; frequent contact; calming for nervous patients; everything explained in detail beforehand; logistics handled.
- **Complain:** pressure to accept extra treatment or pay cash; unclear consent; silence after returning home.

**What clinics expect from a coordinator** (Istanbul job ads on kariyer.net): convert campaign leads over WhatsApp, phone and social media; book appointments; keep the CRM updated; follow up; fluent English + Turkish. KPIs: conversion rate, bookings, patient satisfaction.

## 3. The sales playbook (what the AI does)

The aim of every conversation: **earn trust → move to the next concrete step** (free photo review by the doctor, a call or video at a set time, or a consultation request), and hand to staff with a clean summary.

**Always**
- Reply in the patient's language, short WhatsApp style: 1–3 sentences, **one question per message**. Disclose the AI identity at the start, and when asked.
- **Answer first.** For price, give the clinic's approved range and what drives it ("Zirconia crowns are usually €X–€Y per tooth, depending on…; the doctor confirms after seeing a photo"). Never dodge.
- Learn, one question at a time: treatment wanted → current situation (missing teeth? pain?) → country (for comparison) → travel window → photo or X-ray (explain why: a free personal plan from the doctor, not a generic price).
- Build trust with **facts from the fact sheet only**: lead doctor and years of experience, the ministry authorization, warranty, material brands, what the package includes, the aftercare plan, a reviews link, and case photos the clinic has consent to share.
- Offer the next step with a choice: "Would you like the doctor to review a photo for free, or a short video call this week?"
- Hand off to staff when: a medical or clinical question, a request for a human, a ready-to-pay or discount request, anger, or the AI is unsure. Pass a summary: what they want, facts collected, open questions.

**Objections: clarify → empathize → offer (with permission)**

| Patient says | AI does |
| --- | --- |
| "It's cheaper at clinic X" | Clarify what's included in their quote (materials, implant brand, number of visits, hotel/transfer, warranty). Explain the clinic's package facts. Never bash competitors. Discounts are staff-only. |
| "So cheap — is it bad quality?" | Explain why prices are lower in Turkey (costs, not materials). Name the material and implant brands and the warranty. Offer case photos and reviews. |
| "I'm scared of Turkey teeth" | Validate the fear. Explain the clinic's conservative approach if the fact sheet says so. The doctor decides after the photo; no healthy-tooth filing is promised or denied by the AI. |
| "What if something goes wrong at home?" | State the warranty and aftercare policy from the fact sheet. Offer staff for details. |
| "I need to think / ask my partner" | Respect it. Offer to send a summary they can share. Ask permission to check in on a set day. |
| "Are you a real person?" | Say clearly it's the clinic's AI assistant and offer a team member. |
| Medical question (pain, swelling, "will this work for me?") | No advice. Hand to staff (doctor). |

**Follow-up** (later card, D-021 / 24 h window rules apply): day 1 → day 3–4 with one new piece of value (case story, what's included) → day 7–10 a polite close ("keep your plan on file?"). Stop immediately on STOP.

**Never:** pressure or urgency tricks, invented prices or facts, diagnosis, promised results or dates, pushing extra treatment, discounts, confirming an appointment (staff confirm), copying a competitor's text.

## 4. AI design (open-source patterns applied)

| Pattern | Source | What we take |
| --- | --- | --- |
| Start simple: one agent with good tools beats complex routing; add steps only when evals show a gain | Anthropic, *Building effective agents* | Replace the five routed writer steps with **one coordinator call** plus tools |
| Behavior as many small **conditional guidelines** ("when X → do Y"), each testable and traceable, instead of one giant prompt | Parlant (open source) | Write the playbook as ~30 guidelines in a data file (global + per clinic). No new framework; at our size they fit in one prompt |
| Short core instructions + topic "skills" loaded when relevant; facts carry an **evidence kind**, not a confidence | Comp AI CRM (`~/Desktop/test/crm-release/apps/agent`) | Core prompt stays small; patient facts saved with their source message (PatientFact, ideas #1/#2) |
| Simulated user with a hidden goal + checks on what the agent did | τ-bench (Sierra), CRM `evals/` ("tool called / not called") | Our eval runner (AI-1) |
| Evaluator-optimizer | Anthropic | Keep a light reply check; the deterministic `check_output` stays |

**Target shape**
- **Prompt** = identity + playbook guidelines + **clinic fact sheet** (structured, approved by the clinic: treatments, price ranges, inclusions, warranty, doctors, process/days, location, payment) + patient facts so far + recent messages.
- **Tools:** `search_clinic_documents` (only for long documents), `save_patient_fact`, `handoff_to_staff(reason, summary)`, later `request_consultation` (M3).
- **Keep:** input policy → model → output check → action validation → fail closed to staff; untrusted-text handling; AI disclosure; the action contract changed on both sides together.
- **Drop:** forced qualification, the five writer nodes, English-only handoff keywords, the summarizer's lead-score formula (replace later).

## 5. How we measure (eval set)

- About **40 scenarios** (EN 20, TR 12, AR 8): price shopper, competitor comparison, Turkey-teeth fear, nervous patient, "are you a bot", medical question, angry patient, sends a photo, wants to pay, "I'll think about it", Arabic-speaking family, prompt-injection attempt.
- A **simulated patient** (cheap model) plays each scenario with a hidden goal for up to 8 turns. A **judge** scores each reply against a rubric. **Hard checks** in code: no price outside the fact sheet, AI disclosed when asked, handoff on medical/human request, ≤ 3 sentences, ≤ 1 question, same language as the patient.
- Score = % of scenarios passed + average rubric score. Run by hand before and after each change, for a few dollars (needs founder OK for paid model calls).

## 6. Getting real data

1. **Mystery shopping (this week, founder):** message 10 Istanbul clinics from `reference/research/` on WhatsApp as an interested patient (a generic case, no real medical records). Record the reply time, their first answer, how they handle price and photos, and follow-ups. Results: (a) real coordinator patterns for the playbook, (b) proof for your sales pitch ("your competitors take 3 hours; OmniX answers in seconds"). Use patterns, never copy their text.
2. **Coordinator interviews:** 2–3 coordinators (coffee or a small fee): "What do patients ask? What makes them choose you? What do you say when they say it's cheaper elsewhere?"
3. **Pilot draft mode:** every staff edit of an AI draft is a labelled example. Each week, update the guidelines and re-run the evals.
No public dataset of real dental-tourism sales chats exists (searched). Reviews give the patient voice.

## 7. Cards (after M4)

- **AI-1 Eval set + runner:** a scenario file, a simulated patient, a judge, hard checks, one command, a report. A demo clinic fact sheet (synthetic). Baseline score of today's AI.
- **AI-2 Coordinator v2:** a guidelines file + fact sheet + one agent + tools, behind a per-clinic switch. Old graph kept until v2 beats it on the evals.
- **AI-3 Tune + choose model:** iterate on the guidelines using eval failures and mystery-shopping findings; compare 2–3 models on quality vs cost per conversation; switch the default.

## Sources
- [Planports — the 2-minute rule in dental tourism](https://planports.com/en/blogs/the-2-minute-rule-dental-tourism-patient-conversion.html) (vendor blog)
- [MedicalTourism.com — Converting international patient inquiries](https://magazine.medicaltourism.com/article/converting-international-patient-inquiries-10-part-2)
- [Medical Tourism Association — Dental treatment in Turkey: what patients need to know (2026)](https://www.better.medicaltourism.com/article/dental-treatment-in-turkey-what-international-patients-need-to-know-2026)
- Trustpilot reviews: [Es Clinic Turkey](https://ca.trustpilot.com/review/esclinicturkey.com), [Dental Harmony Turkey](https://dk.trustpilot.com/review/dentalharmonyturkey.com)
- [kariyer.net — Moral Dental Turkey senior sales specialist ad](https://www.kariyer.net/is-ilani/moral-dental-turkey-kidemli-satis-uzmani-4560920)
- [dentistry.co.uk — Overcoming objections](https://dentistry.co.uk/2014/07/02/overcoming-objections/)
- [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Parlant overview](https://redreamality.com/blog/parlant-ai-agent-framework/) · [τ-bench paper](https://export.arxiv.org/pdf/2406.12045)
- Comp AI CRM release (local): `apps/agent/agent/skills/evidence.md`, `apps/agent/evals/`
