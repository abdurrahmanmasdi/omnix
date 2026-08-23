# OmniDesk AI: Next.js Frontend (The Control Center)
**Version:** 2.0 | **Role:** Human-in-the-Loop Interface & CRM Dashboard

## 1. Service Overview
The Next.js application serves as the "Control Center" for clinic staff and admins. It provides a real-time view into AI-managed conversations, the lead pipeline, and system settings. It is designed as a "Reactive UI" that immediately reflects the backend state.

## 2. Core Components
*   **Real-Time Sync (Socket.IO + TanStack Query):**
    *   Listens to global socket events (`onLeadUpdate`, `onConversationUpdate`).
    *   Uses TanStack React Query (`queryClient.invalidateQueries`) to automatically refetch data when the backend signals a change, eliminating the need for manual page refreshes.
*   **Conversations Interface:**
    *   Displays live chat bubbles.
    *   Visually indicates when the AI is active vs. paused (`aiPaused` state). Optimistically updates the UI when a handoff occurs.
*   **Leads & Pipeline Dashboard:**
    *   A Kanban/Table view of all patients, pulling directly from the internal state model (`NEW`, `QUALIFIED`, `HANDED_OFF`).
*   **Global Notification System:**
    *   Intercepts `new_notification` events (e.g., from the `NOTIFY_AGENT` tool action) and displays persistent Sonner toast alerts so staff never miss a hot lead or an angry patient.

## 3. Strict Architectural Guardrails
*   **Dumb UI Principle:** The frontend must never contain business logic, prompt logic, or direct WhatsApp integrations. It solely consumes the NestJS API and reacts to Socket events.
*   **Optimistic Updates:** Where applicable (like pausing the AI), the UI should update the cache optimistically to provide a snappy experience before the background refetch completes.