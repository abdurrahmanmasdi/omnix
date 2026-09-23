'use client';

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTenantQueryKey } from "@/hooks/useTenantQueryKey";
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
  const scopeKey = useTenantQueryKey();
  const { socket, isConnected } = useSocket();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // 1. Fetch ALL leads for the Kanban Board (we use limit 100 for now to get a board view)
  const { data: paginatedLeads, isLoading: leadsLoading } = useLeadsControllerFindAll({ 
    page: 1, 
    limit: 100 
  });
  
  const leads = Array.isArray(paginatedLeads) 
    ? paginatedLeads 
    : ((paginatedLeads as any)?.data ?? []);

  // We also need conversation data to get `aiPaused` state. We can fetch conversations and map them.
  const { data: conversations, refetch: refetchConversations } =
    useConversationsControllerGetConversations({ page: "1", limit: "100" });

  const activeConversationData = (conversations as ConversationsControllerGetConversations200Item[])?.find(
    (c: ConversationsControllerGetConversations200Item) => c.id === activeConversationId
  );



  // 4. THE MAGIC: Orchestrate WebSockets
  useEffect(() => {
    if (!socket) return;

    // --- Message Listener ---
    const handleNewMessage = (data: LiveMessagePayload) => {
      refetchConversations(); // refresh sidebar/conversations

      if (data && data.content && data.conversationId) {
        const queryKey = scopeKey(['/conversations', data.conversationId, 'messages']);
        
        queryClient.setQueryData(queryKey, (old: any) => {
          if (!old || !old.pages || old.pages.length === 0) return old;
          
          // Check if already exists in any page
          for (const page of old.pages) {
            if (page.data?.some((m: any) => m.id === data.id)) return old;
          }

          const newMsg = {
            id: data.id,
            content: data.content,
            createdAt: data.createdAt,
            handledBy: data.handledBy as "AI" | "HUMAN",
            type: data.type as "USER_TEXT" | "SYSTEM_TEXT" | "AI_TEXT",
            mediaUrl: data.mediaUrl || undefined
          };
          
          // Prepend to first page
          const newPages = [...old.pages];
          newPages[0] = {
            ...newPages[0],
            data: [newMsg, ...(newPages[0].data || [])]
          };
          
          return { ...old, pages: newPages };
        });
      }
    };

    // --- Conversation Update (AI Paused) Listener ---
    const handleConversationUpdate = (data: ConversationUpdatePayload) => {
      queryClient.invalidateQueries({ queryKey: scopeKey(['/conversations']) });
      
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
    const handleLeadUpdate = async (data: LeadUpdatePayload) => {
      console.log('[Socket] onLeadUpdate received in Orchestrator:', data.id);
      await queryClient.cancelQueries({ queryKey: scopeKey(['/leads']) });
      // Invalidate leads so the Kanban board physically moves the card if the stage changed on the backend
      queryClient.invalidateQueries({ queryKey: scopeKey(['/leads']) });
    };

    socket.on("onNewMessage", handleNewMessage);
    socket.on('onConversationUpdate', handleConversationUpdate);
    socket.on('onLeadUpdate', handleLeadUpdate);

    return () => {
      socket.off("onNewMessage", handleNewMessage);
      socket.off('onConversationUpdate', handleConversationUpdate);
      socket.off('onLeadUpdate', handleLeadUpdate);
    };
  }, [socket, activeConversationId, queryClient, refetchConversations, scopeKey]);



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
              onClose={() => setActiveConversationId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
