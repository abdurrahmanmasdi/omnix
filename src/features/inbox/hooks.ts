"use client";

import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import {
  conversationsControllerGetConversations,
  conversationsControllerGetMessages,
  getConversationsControllerGetConversationsQueryKey,
  getConversationsControllerGetMessagesQueryKey,
  getConversationsControllerGetConversationQueryKey,
} from "@/lib/api/generated/conversations/conversations";
import {
  getLeadsControllerFindAllQueryKey,
  getLeadsControllerFindOneQueryKey,
} from "@/lib/api/generated/leads/leads";
import type {
  ConversationsControllerGetConversationsFilter,
  InboxMessagesPageDto,
} from "@/lib/api/model";
import { useSocket } from "@/hooks/useSocket";
import type {
  LiveMessagePayload,
  ConversationUpdatePayload,
  LeadUpdatePayload,
} from "@/lib/contracts/socket-events.generated";
import { mergeMessage } from "./model";

export const INBOX_PAGE_SIZE = 30;
export function useConversationList(
  filter: ConversationsControllerGetConversationsFilter,
) {
  return useInfiniteQuery({
    queryKey: getConversationsControllerGetConversationsQueryKey({
      filter,
      limit: INBOX_PAGE_SIZE,
    }),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      conversationsControllerGetConversations(
        { filter, page: pageParam, limit: INBOX_PAGE_SIZE },
        undefined,
        signal,
      ),
    getNextPageParam: (last, pages) =>
      last.length === INBOX_PAGE_SIZE ? pages.length + 1 : undefined,
  });
}
export function useThreadHistory(id: string) {
  return useInfiniteQuery({
    queryKey: getConversationsControllerGetMessagesQueryKey(id),
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      conversationsControllerGetMessages(
        id,
        { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) },
        undefined,
        signal,
      ),
    getNextPageParam: (last) =>
      last.hasMore && last.nextCursor ? last.nextCursor : undefined,
  });
}
export function useInboxSocket(
  activeId: string | null,
  onUnseen: (conversationId: string) => void,
) {
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();
  useEffect(() => {
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function refreshList() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: getConversationsControllerGetConversationsQueryKey(),
        });
      }, 200);
    }
    const message = (payload: LiveMessagePayload) => {
      refreshList();
      if (payload.conversationId !== activeId) onUnseen(payload.conversationId);
      queryClient.setQueryData<InfiniteData<InboxMessagesPageDto>>(
        getConversationsControllerGetMessagesQueryKey(payload.conversationId),
        (old) => mergeMessage(old, payload),
      );
      // HTTP reconciles uncertain delivery and rechecks history access after role changes.
      void queryClient.invalidateQueries({
        queryKey: getConversationsControllerGetMessagesQueryKey(
          payload.conversationId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: getConversationsControllerGetConversationQueryKey(
          payload.conversationId,
        ),
      });
    };
    const conversation = (payload: ConversationUpdatePayload) => {
      refreshList();
      // Socket has no stateVersion: refetch the authoritative detail instead of guessing ordering.
      void queryClient.invalidateQueries({
        queryKey: getConversationsControllerGetConversationQueryKey(payload.id),
      });
    };
    const lead = (payload: LeadUpdatePayload) => {
      refreshList();
      void queryClient.invalidateQueries({
        queryKey: getLeadsControllerFindAllQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: getLeadsControllerFindOneQueryKey(payload.id),
      });
      if (activeId)
        void queryClient.invalidateQueries({
          queryKey: getConversationsControllerGetConversationQueryKey(activeId),
        });
    };
    const reconnect = () => {
      refreshList();
      if (activeId) {
        void queryClient.invalidateQueries({
          queryKey: getConversationsControllerGetConversationQueryKey(activeId),
        });
        void queryClient.invalidateQueries({
          queryKey: getConversationsControllerGetMessagesQueryKey(activeId),
        });
      }
    };
    socket.on("onNewMessage", message);
    socket.on("onConversationUpdate", conversation);
    socket.on("onLeadUpdate", lead);
    socket.on("connect", reconnect);
    return () => {
      clearTimeout(timer);
      socket.off("onNewMessage", message);
      socket.off("onConversationUpdate", conversation);
      socket.off("onLeadUpdate", lead);
      socket.off("connect", reconnect);
    };
  }, [socket, queryClient, activeId, onUnseen]);
  return isConnected;
}
