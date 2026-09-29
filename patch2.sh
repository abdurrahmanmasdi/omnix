#!/bin/bash
sed -i '' '1i\
import { getLeadsControllerGetLeadsQueryKey } from "@/lib/api/generated/leads/leads";\
' src/app/dashboard/conversations/page.tsx

sed -i '' '1i\
import { getConversationsControllerGetConversationsQueryKey } from "@/lib/api/generated/conversations/conversations";\
' src/components/conversations/LiveChatPane.tsx

sed -i '' '1i\
import { getLeadsControllerGetLeadsQueryKey } from "@/lib/api/generated/leads/leads";\
' src/components/conversations/LiveKanbanBoard.tsx

sed -i '' '1i\
import { getLeadsControllerGetLeadsQueryKey } from "@/lib/api/generated/leads/leads";\
' src/components/leads/KanbanBoard.tsx

sed -i '' '1i\
import { getLeadsControllerGetLeadsQueryKey } from "@/lib/api/generated/leads/leads";\
import { getPipelineStagesControllerGetPipelineStagesQueryKey } from "@/lib/api/generated/pipeline-stages/pipeline-stages";\
' src/components/leads/LeadsDashboardClient.tsx

