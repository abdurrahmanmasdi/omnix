'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useConversationsControllerGetMessages,
  useConversationsControllerSendMessage,
  useConversationsControllerToggleAi,
} from '@/lib/api/generated/conversations/conversations';
import type {
  ConversationsControllerGetMessages200Item,
  ConversationsControllerGetConversations200Item,
} from '@/lib/api/model';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, User, Bot, Play, Pause, AlertTriangle, X, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

interface LiveChatPaneProps {
  activeConversationId: string;
  activeConversationData?: ConversationsControllerGetConversations200Item & { aiPaused?: boolean };
  onClose: () => void;
  liveMessages: ConversationsControllerGetMessages200Item[]; // Real-time messages passed down from Orchestrator
}

export function LiveChatPane({ activeConversationId, activeConversationData, onClose, liveMessages }: LiveChatPaneProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Historical messages
  const { data: historicalMessages } = useConversationsControllerGetMessages(
    activeConversationId,
    { page: "1", limit: "50" },
    { query: { enabled: !!activeConversationId } }
  );

  const [activeMessages, setActiveMessages] = useState<ConversationsControllerGetMessages200Item[]>([]);

  // Sync historical messages
  useEffect(() => {
    if (historicalMessages && historicalMessages.length > 0) {
      setActiveMessages([...historicalMessages].reverse());
    } else {
      setActiveMessages([]);
    }
  }, [historicalMessages]);

  // Combine historical with new live messages
  useEffect(() => {
    if (liveMessages.length > 0) {
      setActiveMessages((prev) => {
        const newMessages = liveMessages.filter(
          (liveMsg) => !prev.some((prevMsg) => prevMsg.id === liveMsg.id)
        );
        return [...prev, ...newMessages];
      });
    }
  }, [liveMessages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeMessages]);

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
      }
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
          queryClient.invalidateQueries({ queryKey: [`/conversations`] });
        }
      }
    );
  };

  return (
    <Card className="w-full flex flex-col h-full shadow-2xl border-l-0 rounded-l-none rounded-r-2xl border-slate-200 z-10 animate-in slide-in-from-right-16 duration-300">
      {/* Chat Header */}
      <div className="border-b px-6 py-4 bg-white rounded-tr-2xl flex justify-between items-center shadow-sm relative z-10">
        <div className="flex items-center space-x-3">
          <Avatar className="h-10 w-10 border border-slate-100 shadow-sm">
            <AvatarFallback className="bg-blue-50 text-blue-600 font-bold">
              <User size={18} />
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-bold text-slate-900 leading-none mb-1">
              {activeConversationData?.lead?.name || activeConversationData?.lead?.phoneNumber || 'Active Chat'}
            </h3>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">
              ID: {activeConversationId.substring(0, 8)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isAiPaused ? 'text-amber-500' : 'text-emerald-500'}`}>
              {isAiPaused ? 'AI Paused' : 'AI Active'}
            </span>
            <Button 
              variant={isAiPaused ? 'outline' : 'default'} 
              size="sm" 
              onClick={handleToggleAi}
              disabled={toggleAiMutation.isPending}
              className={`h-8 px-3 rounded-lg font-bold transition-all ${
                !isAiPaused 
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-200' 
                  : 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100'
              }`}
            >
              {isAiPaused ? <Play size={12} className="mr-1.5" /> : <Pause size={12} className="mr-1.5" />}
              {isAiPaused ? 'Resume AI' : 'Pause AI'}
            </Button>
          </div>
          
          <div className="h-6 w-px bg-slate-200" />
          
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors">
            <X size={20} />
          </Button>
        </div>
      </div>

      {/* AI Paused Banner */}
      {isAiPaused && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 backdrop-blur-sm px-4 py-3 shadow-sm shrink-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100/50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">AI Agent Paused</p>
            <p className="text-xs font-medium text-amber-700">Human intervention required.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleAi}
            disabled={toggleAiMutation.isPending}
            className="h-8 border-amber-300 text-amber-700 hover:bg-amber-100 bg-white shadow-sm font-bold"
          >
            <Play size={12} className="mr-1.5" />
            Resume
          </Button>
        </div>
      )}

      {/* Chat History */}
      <div
        className="flex-1 overflow-y-auto p-6 bg-slate-50/50 relative"
        ref={scrollRef}
      >
        <div className="space-y-6">
          {activeMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-50 pt-20">
              <MessageSquare size={48} className="mb-4" />
              <p className="text-sm font-medium">No messages yet.</p>
            </div>
          ) : (
            activeMessages.map((msg, idx) => {
              const isUser = msg.type === "LEAD_TEXT";
              const showAvatar = idx === activeMessages.length - 1 || activeMessages[idx + 1]?.type !== msg.type;
              
              return (
                <div
                  key={msg.id || idx}
                  className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}
                >
                  <div className={`flex items-end space-x-2 max-w-[85%] ${isUser ? "flex-row" : "flex-row-reverse space-x-reverse"}`}>
                    <div className="w-6 shrink-0 flex flex-col justify-end pb-1">
                      {showAvatar && (
                        <Avatar className="h-6 w-6 shadow-sm border border-slate-100">
                          <AvatarFallback className={isUser ? "bg-white text-slate-600 text-[10px]" : "bg-blue-600 text-white text-[10px]"}>
                            {isUser ? <User size={12} /> : <Bot size={12} />}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        isUser
                          ? "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                          : "bg-blue-600 text-white rounded-br-sm border border-blue-700"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest ${isUser ? "ml-10" : "mr-10"}`}>
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
      <div className="p-4 bg-white border-t border-slate-100 rounded-br-2xl shadow-[0_-4px_20px_-15px_rgba(0,0,0,0.1)] relative z-10">
        <div className="flex space-x-2">
          <Input
            placeholder={isAiPaused ? "Type a manual reply..." : "Pause AI to type manually..."}
            className={`flex-1 h-12 rounded-xl border-slate-200 focus-visible:ring-blue-500 ${!isAiPaused && 'bg-slate-50 opacity-70'}`}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sendMessageMutation.isPending || !isAiPaused}
          />
          <Button
            className="bg-blue-600 hover:bg-blue-700 h-12 px-6 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
            onClick={handleSendMessage}
            disabled={sendMessageMutation.isPending || !messageInput.trim() || !isAiPaused}
          >
            <Send size={16} className="mr-2" />
            {sendMessageMutation.isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
