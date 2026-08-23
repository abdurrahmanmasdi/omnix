"use client";

import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket, LiveMessagePayload } from "@/hooks/useSocket";
import type { ConversationUpdatePayload } from "@/hooks/useSocket";
import {
  useConversationsControllerGetConversations,
  useConversationsControllerGetMessages,
  useConversationsControllerSendMessage,
  useConversationsControllerToggleAi,
  getConversationsControllerGetConversationsQueryKey,
} from "@/lib/api/generated/conversations/conversations";
import type {
  ConversationsControllerGetMessages200Item,
  ConversationsControllerGetConversations200Item,
} from "@/lib/api/model";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, User, Bot, Play, Pause, AlertTriangle } from 'lucide-react';

export default function ConversationsPage() {
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);

  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // 1. Fetch the list of conversations (Left Sidebar)
  const { data: conversations, refetch: refetchConversations } =
    useConversationsControllerGetConversations({ page: "1", limit: "20" });

  // 2. Fetch historical messages for the strictly selected conversation (Right Window)
  const { data: historicalMessages } = useConversationsControllerGetMessages(
    activeConversationId as string,
    { page: "1", limit: "50" },
    { query: { enabled: !!activeConversationId } }, // Only run if a chat is clicked!
  );

  // 3. Local state to blend history with live WebSockets
  const [activeMessages, setActiveMessages] = useState<
    ConversationsControllerGetMessages200Item[]
  >([]);

  // Sync historical messages into our local state when they load
  useEffect(() => {
    if (historicalMessages && historicalMessages.length > 0) {
      setActiveMessages([...historicalMessages].reverse());
    } else {
      setActiveMessages([]);
    }
  }, [historicalMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeMessages]);

  // 4. THE MAGIC: Listen for WebSockets and inject them into the UI
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: LiveMessagePayload | any) => {
      // Refresh the sidebar
      refetchConversations();

      // Robust extraction: Handle whether data is the wrapper OR the raw message
      const actualMessage = data.message ? data.message : data;
      const convId = data.conversationId || actualMessage.conversationId;

      // If the incoming message belongs to the chat we are currently looking at...
      if (convId === activeIdRef.current) {
        // Ensure the message has content before rendering
        if (actualMessage && actualMessage.content) {
          setActiveMessages((prev) => {
            // Prevent rendering duplicates if Meta fires the webhook twice
            if (prev.some((m) => m.id === actualMessage.id)) return prev;

            return [...prev, actualMessage];
          });
        }
      }
    };

    socket.on("onNewMessage", handleNewMessage);
    return () => {
      socket.off("onNewMessage", handleNewMessage);
    };
  }, [socket, refetchConversations]);

  // 4b. Listen for real-time conversation updates (AI paused / handoff)
  useEffect(() => {
    if (!socket) return;

    const handleConversationUpdate = (data: ConversationUpdatePayload) => {
      // Optimistically patch the conversations list cache so sidebar reflects immediately
      queryClient.setQueriesData<(ConversationsControllerGetConversations200Item & { aiPaused?: boolean })[]>(
        { queryKey: [`/conversations`] },
        (old) => {
          if (!old) return old;
          return old.map((conv) =>
            conv.id === data.conversationId
              ? { ...conv, aiPaused: data.aiPaused }
              : conv
          );
        }
      );

      // Also refetch to ensure full consistency
      refetchConversations();

      // Show toast when AI is paused (handoff scenario)
      if (data.aiPaused) {
        toast.warning('AI has been paused', {
          description: data.reason || 'A human agent needs to step in for this conversation.',
          duration: 8000,
        });
      } else {
        toast.success('AI resumed', {
          description: 'The AI agent is now handling this conversation again.',
          duration: 4000,
        });
      }
    };

    socket.on('onConversationUpdate', handleConversationUpdate);
    return () => {
      socket.off('onConversationUpdate', handleConversationUpdate);
    };
  }, [socket, queryClient, refetchConversations]);

  // 1. Add the state for the input field at the top of your component
  const [messageInput, setMessageInput] = useState("");

  // 2. Initialize the generated Orval mutation
  const sendMessageMutation = useConversationsControllerSendMessage();

  // 3. Create the submit handler
  const handleSendMessage = () => {
    if (!messageInput.trim() || !activeConversationId) return;

    sendMessageMutation.mutate(
      {
        id: activeConversationId,
        data: { content: messageInput },
      },
      {
        onSuccess: () => {
          // Clear the input field.
          // We don't need to manually update the UI because the backend
          // immediately fires the WebSocket, which our listener will catch and render!
          setMessageInput("");
        },
        onError: (err) => {
          console.error("Failed to send message", err);
          // Maybe show a toast error here
        },
      },
    );
  };

  // 4. Create an 'Enter' key handler for convenience
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSendMessage();
    }
  };

  const toggleAiMutation = useConversationsControllerToggleAi();
  // Retrieve the current conversation object to read its aiPaused state
  // (aiPaused is returned by the API but not yet in the Orval-generated type)
  const activeConversationData = conversations?.find((c: any) => c.id === activeConversationId) as
    | (ConversationsControllerGetConversations200Item & { aiPaused?: boolean })
    | undefined;
  const isAiPaused = activeConversationData?.aiPaused || false;

  const handleToggleAi = () => {
    if (!activeConversationId) return;
    toggleAiMutation.mutate(
      { id: activeConversationId },
      {
        onSuccess: () => {
          refetchConversations(); // Refresh sidebar to get updated state
        }
      }
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-slate-50 p-6 space-x-6">
      {/* LEFT PANE: Conversation List */}
      <Card className="w-1/3 flex flex-col h-full shadow-sm border-slate-200">
        <CardHeader className="border-b px-4 py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Inbox</CardTitle>
          <div
            className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
            title={isConnected ? "Live" : "Disconnected"}
          />
        </CardHeader>
        <CardContent className="flex-1 p-0">
          <ScrollArea className="h-full">
            {conversations?.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No conversations yet.
              </div>
            ) : (
              conversations?.map((conv) => {
                const latestMsg = conv.messages?.[0];
                const isActive = conv.id === activeConversationId;
                const leadData = conv.lead;
                const displayTitle = leadData
                  ? leadData.name && leadData.name !== "New WhatsApp Lead"
                    ? leadData.name
                    : leadData.phoneNumber
                  : conv.id?.substring(0, 8);

                return (
                  <div
                    key={conv.id}
                    onClick={() => setActiveConversationId(conv.id!)}
                    className={`flex items-start space-x-3 p-4 border-b cursor-pointer transition-colors hover:bg-slate-50 ${isActive ? "bg-blue-50/50 border-l-4 border-l-blue-600" : "border-l-4 border-l-transparent"}`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-slate-200 text-slate-600">
                        <User size={18} />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex justify-between items-baseline mb-1">
                        <h4 className="font-semibold text-sm truncate">
                          {latestMsg && (
                            <span className="text-xs text-slate-400">
                              {new Date(
                                latestMsg.createdAt!,
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </h4>
                        {latestMsg && (
                          <span className="text-xs text-slate-400">
                            {new Date(
                              latestMsg.createdAt || "",
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {latestMsg ? latestMsg.content : "No messages yet"}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* RIGHT PANE: Active Chat Window */}
      <Card className="w-2/3 flex flex-col h-full shadow-sm border-slate-200">
        {activeConversationId ? (
          <>
            {/* Chat Header */}
            <div className="border-b px-6 py-4 bg-white rounded-t-xl flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <Avatar><AvatarFallback className="bg-blue-100 text-blue-600"><User size={20} /></AvatarFallback></Avatar>
                <div>
                  <h3 className="font-semibold">Chat</h3>
                  <p className="text-xs text-slate-500">ID: {activeConversationId}</p>
                </div>
              </div>
              
              {/* AI Toggle Control */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-500 font-medium">
                  {isAiPaused ? 'AI Paused' : 'AI Active'}
                </span>
                <Button 
                  variant={isAiPaused ? 'outline' : 'default'} 
                  size="sm" 
                  onClick={handleToggleAi}
                  disabled={toggleAiMutation.isPending}
                  className={!isAiPaused ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  {isAiPaused ? <Play size={14} className="mr-1" /> : <Pause size={14} className="mr-1" />}
                  {isAiPaused ? 'Resume AI' : 'Pause AI'}
                </Button>
              </div>
            </div>

            {/* AI Paused Banner */}
            {isAiPaused && (
              <div className="mx-6 mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 animate-in slide-in-from-top-2 duration-300">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">AI Agent Paused</p>
                  <p className="text-xs text-amber-700">Human intervention required. Type a reply or resume the AI.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleAi}
                  disabled={toggleAiMutation.isPending}
                  className="border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  <Play size={12} className="mr-1" />
                  Resume
                </Button>
              </div>
            )}

            {/* Chat History */}
            <div
              className="flex-1 overflow-y-auto p-6 bg-slate-50/50"
              ref={scrollRef}
            >
              <div className="space-y-4">
                {activeMessages.map((msg, idx) => {
                  const isUser = msg.type === "LEAD_TEXT";
                  return (
                    <div
                      key={msg.id || idx}
                      className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}
                    >
                      <div className="flex items-end justify-end space-x-2">
                        {isUser && (
                          <Avatar className="h-6 w-6 mb-1">
                            <AvatarFallback className="bg-slate-300 text-xs">
                              <User size={12} />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                            isUser
                              ? "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm"
                              : "bg-blue-600 text-white rounded-br-sm shadow-sm"
                          }`}
                        >
                          {msg.content}
                        </div>
                        {!isUser && (
                          <Avatar className="h-6 w-6 mb-1">
                            <AvatarFallback className="bg-blue-200 text-blue-700 text-xs">
                              {msg.type === "USER_TEXT" ? <User size={12} /> : <Bot size={12} />}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-8">
                        {new Date(msg.createdAt || "").toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chat Input (Visual Placeholder for manual replies) */}
            <div className="p-4 bg-white border-t rounded-b-xl">
              <div className="flex space-x-2">
                <Input
                  placeholder="Type a message to override the AI..."
                  className="flex-1"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sendMessageMutation.isPending || !isAiPaused}
                />
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={handleSendMessage}
                  disabled={
                    sendMessageMutation.isPending || !messageInput.trim()
                  }
                >
                  <Send size={18} className="mr-2" />
                  {sendMessageMutation.isPending ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="h-20 w-20 rounded-full bg-slate-100 flex items-center justify-center">
              <Bot size={40} className="text-slate-300" />
            </div>
            <p>Select a conversation to view history</p>
          </div>
        )}
      </Card>
    </div>
  );
}
