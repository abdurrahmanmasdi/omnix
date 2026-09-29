#!/bin/bash
sed -i '' 's|import { useConversationsControllerGetConversations } from "@/lib/api/generated/conversations/conversations";|import { useConversationsControllerGetConversations, getConversationsControllerGetConversationsQueryKey } from "@/lib/api/generated/conversations/conversations";|g' src/app/dashboard/conversations/page.tsx
sed -i '' 's|import { useLeadsControllerGetLeads } from "@/lib/api/generated/leads/leads";|import { useLeadsControllerGetLeads, getLeadsControllerGetLeadsQueryKey } from "@/lib/api/generated/leads/leads";|g' src/app/dashboard/conversations/page.tsx

sed -i '' 's|import { useChannelsControllerGetChannels } from "@/lib/api/generated/channels/channels";|import { useChannelsControllerGetChannels, getChannelsControllerGetChannelsQueryKey } from "@/lib/api/generated/channels/channels";|g' src/app/dashboard/settings/channels/page.tsx

sed -i '' 's|import { useChannelsControllerCreateChannel } from "@/lib/api/generated/channels/channels";|import { useChannelsControllerCreateChannel, getChannelsControllerGetChannelsQueryKey } from "@/lib/api/generated/channels/channels";|g' src/components/channels/AddChannelModal.tsx

sed -i '' 's|import { useConversationsControllerGetConversations } from "@/lib/api/generated/conversations/conversations";|import { useConversationsControllerGetConversations, getConversationsControllerGetConversationsQueryKey } from "@/lib/api/generated/conversations/conversations";|g' src/components/conversations/LiveChatPane.tsx

sed -i '' 's|import { useLeadsControllerGetLeads } from "@/lib/api/generated/leads/leads";|import { useLeadsControllerGetLeads, getLeadsControllerGetLeadsQueryKey } from "@/lib/api/generated/leads/leads";|g' src/components/conversations/LiveKanbanBoard.tsx

sed -i '' 's|import { useLeadsControllerGetLeads } from "@/lib/api/generated/leads/leads";|import { useLeadsControllerGetLeads, getLeadsControllerGetLeadsQueryKey } from "@/lib/api/generated/leads/leads";|g' src/components/leads/KanbanBoard.tsx

sed -i '' 's|import { useLeadsControllerGetLeads } from "@/lib/api/generated/leads/leads";|import { useLeadsControllerGetLeads, getLeadsControllerGetLeadsQueryKey } from "@/lib/api/generated/leads/leads";|g' src/components/leads/LeadsDashboardClient.tsx
sed -i '' 's|import { usePipelineStagesControllerGetPipelineStages } from "@/lib/api/generated/pipeline-stages/pipeline-stages";|import { usePipelineStagesControllerGetPipelineStages, getPipelineStagesControllerGetPipelineStagesQueryKey } from "@/lib/api/generated/pipeline-stages/pipeline-stages";|g' src/components/leads/LeadsDashboardClient.tsx

