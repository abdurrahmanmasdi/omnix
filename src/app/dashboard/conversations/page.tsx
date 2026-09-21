'use client';

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket, LiveMessagePayload } from "@/hooks/useSocket";
import type { ConversationUpdatePayload, LeadUpdatePayload } from "@/hooks/useSocket";
import { useLeadsControllerFindAll } from "@/lib/api/generated/leads/leads";
import { useConversationsControllerGetConversations } from "@/lib/api/generated/conversations/conversations";
import type {
  ConversationsControllerGetMessages200Item,
  ConversationsControllerGetConversations200Item,
} from "@/lib/api/model";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

import { LiveKanbanBoard } from "@/components/conversations/LiveKanbanBoard";
import { LiveChatPane } from "@/components/conversations/LiveChatPane";

export default function ConversationsPage() {
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // 1. Fetch ALL leads for the Kanban Board (we use limit 100 for now to get a board view)
  const { data: paginatedLeads, isLoading: leadsLoading } = useLeadsControllerFindAll({ 
    page: 1, 
    limit: 100 
  });
  
  const leads = Array.isArray(paginatedLeads) 
    ? paginatedLeads 
    : (((paginatedLeads as Record<string, unknown>)?.items ?? (paginatedLeads as Record<string, unknown>)?.data ?? []) as unknown[]);

  // We also need conversation data to get `aiPaused` state. We can fetch conversations and map them.
  const { data: conversations, refetch: refetchConversations } =
    useConversationsControllerGetConversations({ page: "1", limit: "100" });

  const activeConversationData = (conversations as ConversationsControllerGetConversations200Item[])?.find(
    (c: ConversationsControllerGetConversations200Item) => c.id === activeConversationId
  );

  // 3. Local state for incoming live messages to pass down to the chat pane
  const [liveMessages, setLiveMessages] = useState<ConversationsControllerGetMessages200Item[]>([]);

  // 4. THE MAGIC: Orchestrate WebSockets
  useEffect(() => {
    if (!socket) return;

    // --- Message Listener ---
    const handleNewMessage = (data: LiveMessagePayload) => {
      refetchConversations(); // refresh sidebar/conversations

      if (data && data.content) {
        // Pass it to local state so LiveChatPane can append it
        if (data.conversationId === activeConversationId) {
          setLiveMessages((prev) => {
            if (prev.some((m) => m.id === data.id)) return prev;
            
            // Cast to expected type since schema has differences but we only need these fields
            const newMsg = {
              id: data.id,
              content: data.content,
              createdAt: data.createdAt,
              handledBy: data.handledBy as "AI" | "HUMAN",
              type: data.type as "USER_TEXT" | "SYSTEM_TEXT" | "AI_TEXT",
              mediaUrl: data.mediaUrl || undefined
            } as ConversationsControllerGetMessages200Item;
            
            return [...prev, newMsg];
          });
        }
      }
    };

    // --- Conversation Update (AI Paused) Listener ---
    const handleConversationUpdate = (data: ConversationUpdatePayload) => {
      queryClient.invalidateQueries({ queryKey: [`/conversations`] });
      
      if (data.aiPaused) {
        toast.warning('AI has been paused', {
          description: 'A human agent needs to step in for this conversation.',
          duration: 8000,
        });
      } else {
        toast.success('AI resumed', {
          description: 'The AI agent is now handling this conversation again.',
          duration: 4000,
        });
      }
    };

    // --- Lead Update (Stage Changed) Listener ---
    const handleLeadUpdate = (data: LeadUpdatePayload) => {
      console.log('[Socket] onLeadUpdate received in Orchestrator:', data.id);
      // Invalidate leads so the Kanban board physically moves the card if the stage changed on the backend
      queryClient.invalidateQueries({ queryKey: [`/leads`] });
    };

    socket.on("onNewMessage", handleNewMessage);
    socket.on('onConversationUpdate', handleConversationUpdate);
    socket.on('onLeadUpdate', handleLeadUpdate);

    return () => {
      socket.off("onNewMessage", handleNewMessage);
      socket.off('onConversationUpdate', handleConversationUpdate);
      socket.off('onLeadUpdate', handleLeadUpdate);
    };
  }, [socket, activeConversationId, queryClient, refetchConversations]);

  // Clear live messages when switching conversations so they don't bleed over
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveMessages([]);
  }, [activeConversationId]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full overflow-hidden bg-transparent">
      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between border-b border-white/10 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-brand-ice tracking-tight flex items-center">
            LIVE INBOX
            <Badge variant="outline" className="ml-3 bg-brand-electric text-white border-none px-2 py-0 h-5 text-[10px] font-black tracking-tighter shadow-none shadow-brand-electric/20">
              BETA
            </Badge>
          </h1>
          <p className="text-brand-ice/60 font-medium mt-1 text-sm">
            Manage your patient pipeline visually and take over AI conversations instantly.
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-[#051126] px-3 py-1.5 rounded-full border border-white/10 shadow-none">
          <div className={`h-2.5 w-2.5 rounded-full animate-pulse ${isConnected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500"}`} />
          <span className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">
            {isConnected ? 'Real-time Active' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: Full Width Kanban Board (Compresses when Chat opens) */}
        <div 
          className={`h-full transition-all duration-300 ease-in-out ${
            activeConversationId ? 'w-[60%] border-r border-white/10' : 'w-full'
          }`}
        >
          <LiveKanbanBoard 
            leads={leads}
            isLoading={leadsLoading}
            activeConversationId={activeConversationId}
            onSelectConversation={setActiveConversationId}
          />
        </div>

        {/* Right: Chat Pane (Slides in pushing Kanban) */}
        {activeConversationId && (
          <div className="w-[40%] h-full bg-[#051126] relative shrink-0">
            <LiveChatPane 
              activeConversationId={activeConversationId}
              activeConversationData={activeConversationData}
              liveMessages={liveMessages}
              onClose={() => setActiveConversationId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
