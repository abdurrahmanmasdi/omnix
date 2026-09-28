"use client";

import { getConversationsControllerGetConversationsQueryKey } from "@/lib/api/generated/conversations/conversations";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  conversationsControllerGetMessages,
  useConversationsControllerSendMessage,
  useConversationsControllerToggleAi,
} from "@/lib/api/generated/conversations/conversations";
import type {
  ConversationsControllerGetMessages200Item,
  ConversationsControllerGetConversations200Item,
} from "@/lib/api/model";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Send,
  User,
  Bot,
  Play,
  Pause,
  AlertTriangle,
  X,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

interface LiveChatPaneProps {
  activeConversationId: string;
  activeConversationData?: ConversationsControllerGetConversations200Item & {
    aiPaused?: boolean;
  };
  onClose: () => void;
  liveMessages: ConversationsControllerGetMessages200Item[]; // Real-time messages passed down from Orchestrator
}

export function LiveChatPane({
  activeConversationId,
  activeConversationData,
  onClose,
}: Omit<LiveChatPaneProps, "liveMessages">) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Historical messages with infinite scrolling
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["/conversations", activeConversationId, "messages"],
    queryFn: ({ pageParam }) =>
      conversationsControllerGetMessages(activeConversationId, {
        limit: "50",
        cursor: pageParam as string,
      } as any),
    getNextPageParam: (lastPage: any) => lastPage.nextCursor || undefined,
    initialPageParam: undefined,
    enabled: !!activeConversationId,
  });

  const activeMessages: ConversationsControllerGetMessages200Item[] =
    useMemo(() => {
      if (!infiniteData) return [];
      // Flatten all pages and reverse them (newest first -> chronological order for UI)
      const allMessages = infiniteData.pages.flatMap(
        (page: any) => page.data || [],
      );
      return [...allMessages].reverse();
    }, [infiniteData]);

  // Handle scroll to top for pagination
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop } = scrollRef.current;
    if (scrollTop === 0 && hasNextPage && !isFetchingNextPage) {
      // Save current scroll height so we can restore position after new items are added
      const oldScrollHeight = scrollRef.current.scrollHeight;
      fetchNextPage().then(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop =
            scrollRef.current.scrollHeight - oldScrollHeight;
        }
      });
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Auto-scroll to bottom on new message if already near bottom
  useEffect(() => {
    if (scrollRef.current) {
      // Only force scroll to bottom if we are already near it, OR if it's the initial load
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
      if (isNearBottom || infiniteData?.pages.length === 1) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [activeMessages.length, infiniteData]);

  const [messageInput, setMessageInput] = useState("");
  const sendMessageMutation = useConversationsControllerSendMessage();

  const handleSendMessage = () => {
    if (!messageInput.trim() || !activeConversationId) return;

    sendMessageMutation.mutate(
      {
        id: activeConversationId,
        data: { content: messageInput },
      },
      {
        onSuccess: () => {
          setMessageInput("");
        },
        onError: (err) => {
          console.error("Failed to send message", err);
          toast.error("Failed to send message");
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSendMessage();
    }
  };

  const toggleAiMutation = useConversationsControllerToggleAi();
  const isAiPaused = activeConversationData?.aiPaused || false;

  const handleToggleAi = () => {
    toggleAiMutation.mutate(
      { id: activeConversationId },
      {
        onSuccess: () => {
          // The socket `onConversationUpdate` will catch this and update global state,
          // but we can invalidate just in case
          queryClient.invalidateQueries({ queryKey: getConversationsControllerGetConversationsQueryKey() });
        },
      },
    );
  };

  return (
    <Card className="w-full flex flex-col h-full shadow-2xl border-l-0 rounded-l-none rounded-r-2xl border-white/10 z-10 animate-in slide-in-from-right-16 duration-300">
      {/* Chat Header */}
      <div className="border-b px-6 py-4 bg-transparent rounded-tr-2xl flex justify-between items-center shadow-none relative z-10">
        <div className="flex items-center space-x-3">
          <Avatar className="h-10 w-10 border border-white/10 shadow-none">
            <AvatarFallback className="bg-brand-electric/10 text-brand-cyan font-bold">
              <User size={18} />
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-bold text-brand-ice leading-none mb-1">
              {activeConversationData?.lead?.name
                ? activeConversationData.lead.name.trim()
                : activeConversationData?.lead?.phoneNumber || "Active Chat"}
            </h3>
            <p className="text-[10px] text-brand-ice/60 font-medium uppercase tracking-widest">
              ID: {activeConversationId.substring(0, 8)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${isAiPaused ? "text-amber-500" : "text-emerald-500"}`}
            >
              {isAiPaused ? "AI Paused" : "AI Active"}
            </span>
            <Button
              variant={isAiPaused ? "outline" : "default"}
              size="sm"
              onClick={handleToggleAi}
              disabled={toggleAiMutation.isPending}
              className={`h-8 px-3 rounded-lg font-bold transition-all ${
                !isAiPaused
                  ? "bg-brand-cyan/100 hover:bg-emerald-600 text-white shadow-none shadow-emerald-500/20"
                  : "border-amber-500/20 text-amber-400 bg-amber-500/20 hover:bg-amber-500/20"
              }`}
            >
              {isAiPaused ? (
                <Play size={12} className="mr-1.5" />
              ) : (
                <Pause size={12} className="mr-1.5" />
              )}
              {isAiPaused ? "Resume AI" : "Pause AI"}
            </Button>
          </div>

          <div className="h-6 w-px bg-slate-200" />

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-brand-ice/60 hover:text-brand-ice/80 rounded-full hover:bg-[#01081A] transition-colors"
          >
            <X size={20} />
          </Button>
        </div>
      </div>

      {/* AI Paused Banner */}
      {isAiPaused && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/20/80 backdrop-blur-sm px-4 py-3 shadow-none shrink-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20/50">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">AI Agent Paused</p>
            <p className="text-xs font-medium text-amber-400">
              Human intervention required.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleAi}
            disabled={toggleAiMutation.isPending}
            className="h-8 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 bg-transparent shadow-none font-bold"
          >
            <Play size={12} className="mr-1.5" />
            Resume
          </Button>
        </div>
      )}

      {/* Chat History */}
      <div
        className="flex-1 overflow-y-auto p-6 bg-[#051126]/50 relative"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <div className="space-y-6">
          {activeMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-brand-ice/60 opacity-50 pt-20">
              <MessageSquare size={48} className="mb-4" />
              <p className="text-sm font-medium">No messages yet.</p>
            </div>
          ) : (
            activeMessages.map((msg, idx) => {
              const isUser = msg.type?.startsWith("LEAD_");
              const isSystemOrTool =
                msg.type === "SYSTEM_PROMPT" ||
                msg.type === "TOOL_CALL" ||
                msg.type === "TOOL_RESULT";

              if (isSystemOrTool) return null; // Hide internal agent thinking from the UI

              const showAvatar =
                idx === activeMessages.length - 1 ||
                activeMessages[idx + 1]?.type !== msg.type;

              return (
                <div
                  key={msg.id || idx}
                  className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}
                >
                  <div
                    className={`flex items-end space-x-2 max-w-[85%] ${isUser ? "flex-row" : "flex-row-reverse space-x-reverse"}`}
                  >
                    <div className="w-6 shrink-0 flex flex-col justify-end pb-1">
                      {showAvatar && (
                        <Avatar className="h-6 w-6 shadow-none border border-white/10">
                          <AvatarFallback
                            className={
                              isUser
                                ? "bg-transparent text-brand-ice/60 text-[10px]"
                                : "bg-brand-electric text-white text-[10px]"
                            }
                          >
                            {isUser ? <User size={12} /> : <Bot size={12} />}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm shadow-none ${
                        isUser
                          ? "bg-transparent border border-white/10 text-brand-ice/80 rounded-bl-sm"
                          : "bg-brand-electric text-white rounded-br-sm border border-blue-700"
                      }`}
                    >
                      {(
                        msg as ConversationsControllerGetMessages200Item & {
                          mediaUrl?: string;
                        }
                      ).mediaUrl && (
                        <Image
                          src={
                            (
                              msg as ConversationsControllerGetMessages200Item & {
                                mediaUrl?: string;
                              }
                            ).mediaUrl!
                          }
                          alt="Media"
                          width={320}
                          height={320}
                          unoptimized
                          className="max-w-xs rounded-lg mb-2"
                        />
                      )}
                      {msg.content}
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-bold text-brand-ice/60 mt-1 uppercase tracking-widest ${isUser ? "ml-10" : "mr-10"}`}
                  >
                    {new Date(msg.createdAt || "").toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Input */}
      <div className="p-4 bg-transparent border-t border-white/10 rounded-br-2xl shadow-[0_-4px_20px_-15px_rgba(0,0,0,0.1)] relative z-10">
        <div className="flex space-x-2">
          <Input
            placeholder={
              isAiPaused
                ? "Type a manual reply..."
                : "Pause AI to type manually..."
            }
            className={`flex-1 h-12 rounded-xl border-white/10 focus-visible:ring-blue-500 ${!isAiPaused && "bg-[#051126] opacity-70"}`}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sendMessageMutation.isPending || !isAiPaused}
          />
          <Button
            className="bg-brand-electric hover:bg-brand-electric/80 h-12 px-6 rounded-xl font-bold shadow-lg shadow-brand-electric/20 transition-all active:scale-95"
            onClick={handleSendMessage}
            disabled={
              sendMessageMutation.isPending ||
              !messageInput.trim() ||
              !isAiPaused
            }
          >
            <Send size={16} className="mr-2" />
            {sendMessageMutation.isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
