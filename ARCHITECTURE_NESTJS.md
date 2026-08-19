# OmniDesk AI: NestJS Orchestrator (The Muscle)
**Version:** 2.0 | **Role:** Central API, DB Management, & Real-Time Gateway

## 1. Service Overview
The NestJS service is the central nervous system of OmniDesk AI. It handles external webhooks, ensures database integrity, queues background jobs, delegates heavy AI thinking to the Python microservice, and broadcasts real-time updates to the frontend.

## 2. Core Components
*   **Webhook Ingestion & Debouncing (BullMQ):**
    *   Receives incoming messages from the WhatsApp API.
    *   Implements a 7-second debounce pattern using BullMQ. If a user sends multiple messages rapidly, the delay resets, preventing parallel LLM executions and saving API costs.
*   **Action Executor Service:**
    *   Parses the `AgentReply.actions` array returned by the Python gRPC server.
    *   Executes mutations safely via Prisma. Handled actions include: `CREATE_LEAD`, `UPDATE_LEAD`, `PAUSE_CONVERSATION`, and `NOTIFY_AGENT`.
*   **Real-Time Gateway (Socket.IO):**
    *   Maintains active WebSocket connections with the Next.js frontend.
    *   Emits strict, typed events: `onNewMessage`, `onLeadUpdate`, `onConversationUpdate`, and `new_notification`.

## 3. Strict Architectural Guardrails
*   **Single Source of Truth:** NestJS (via Prisma) is the ONLY service permitted to mutate the core CRM tables. 
*   **Asynchronous AI Delegation:** Controller routes must never `await` the gRPC Python calls directly to avoid Meta API timeouts. All AI generation is offloaded to background worker processors.
*   **Event-Driven UI:** Every database mutation executed by the `ActionExecutorService` MUST be followed by a `broadcast` event to ensure the frontend is instantly aware of the state change.