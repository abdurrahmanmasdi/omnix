# OmniDesk AI: Python Service Architecture (The Brain)
**Version:** 2.0 | **Role:** AI Orchestration, NLP, & RAG

## 1. Service Overview
The Python service acts exclusively as the "Brain" of the OmniDesk AI platform. It is responsible for understanding incoming patient messages, managing the conversation state, fetching medical knowledge, and formulating human-like responses. It operates on an Event-Driven model and communicates with the rest of the system via gRPC.

## 2. Core Components
*   **State Machine (LangGraph):** Manages the conversation flow using a directed graph. 
    *   **Classifier Node:** Determines user intent (e.g., `PRICE_OBJECTION`, `MEDICAL_FEAR`) and language using `gpt-5.4-mini`.
    *   **Specialized Writers:** A suite of targeted prompts that handle specific intents using strict sales guidelines.
    *   **Humanizer Node:** The final interceptor that rewrites the LLM draft into short, casual WhatsApp bubbles (separated by `|||`).
*   **Knowledge Engine (RAG):** Uses `text-embedding-3-large` (3072 dimensions) and PostgreSQL (`pgvector`) to retrieve factual clinic data (prices, services, social proof) to prevent hallucination.
*   **gRPC Server:** Exposes endpoints (`GenerateReply`, `IngestPdf`, `EmbedExperience`) for the NestJS orchestrator to call.

## 3. Strict Architectural Guardrails
*   **Zero Database Writes:** The Python service is STRICTLY FORBIDDEN from executing raw `INSERT` or `UPDATE` queries on the CRM tables (`leads`, `conversations`).
*   **Virtual Tool Actions:** When the AI decides a system change is needed (e.g., escalating to a human or updating a lead status), it must yield a specially formatted string (e.g., `TOOL_ACTION:PAUSE_CONVERSATION:{}`).
*   **Medical Safety:** Instructed via prompts to never provide medical diagnoses. Any post-op or complex medical inquiries immediately trigger a `HANDED_OFF` state.