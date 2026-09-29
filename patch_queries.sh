#!/bin/bash
sed -i '' 's/queryClient.invalidateQueries({ queryKey: \["\/channels"\] });/queryClient.invalidateQueries({ queryKey: getChannelsControllerGetChannelsQueryKey() });/g' src/app/dashboard/settings/channels/page.tsx
sed -i '' 's/queryClient.invalidateQueries({ queryKey: \[`\/channels`\] });/queryClient.invalidateQueries({ queryKey: getChannelsControllerGetChannelsQueryKey() });/g' src/components/channels/AddChannelModal.tsx
sed -i '' 's/queryClient.invalidateQueries({ queryKey: \["\/conversations"\] });/queryClient.invalidateQueries({ queryKey: getConversationsControllerGetConversationsQueryKey() });/g' src/app/dashboard/conversations/page.tsx
sed -i '' 's/queryClient.invalidateQueries({ queryKey: \["\/leads"\] });/queryClient.invalidateQueries({ queryKey: getLeadsControllerGetLeadsQueryKey() });/g' src/app/dashboard/conversations/page.tsx
sed -i '' 's/queryClient.invalidateQueries({ queryKey: \["\/leads"\] });/queryClient.invalidateQueries({ queryKey: getLeadsControllerGetLeadsQueryKey() });/g' src/components/leads/KanbanBoard.tsx
sed -i '' 's/queryClient.invalidateQueries({ queryKey: \["\/leads"\] });/queryClient.invalidateQueries({ queryKey: getLeadsControllerGetLeadsQueryKey() });/g' src/components/leads/LeadsDashboardClient.tsx
sed -i '' 's/queryClient.invalidateQueries({ queryKey: \["\/pipeline-stages"\] });/queryClient.invalidateQueries({ queryKey: getPipelineStagesControllerGetPipelineStagesQueryKey() });/g' src/components/leads/LeadsDashboardClient.tsx
sed -i '' 's/queryClient.invalidateQueries({ queryKey: \["\/conversations"\] });/queryClient.invalidateQueries({ queryKey: getConversationsControllerGetConversationsQueryKey() });/g' src/components/conversations/LiveChatPane.tsx
sed -i '' 's/queryClient.invalidateQueries({ queryKey: \["\/leads"\] });/queryClient.invalidateQueries({ queryKey: getLeadsControllerGetLeadsQueryKey() });/g' src/components/conversations/LiveKanbanBoard.tsx
