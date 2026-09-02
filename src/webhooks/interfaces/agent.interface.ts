import { Observable } from 'rxjs';

export interface AgentRequest {
  organizationId: string;
  conversationId: string;
  latestMessage: string;
  clinicName?: string;
  agentTone?: string;
  businessRulesJson?: string;
  imageBase64?: string;
  audioBase64?: string;
  totalMessageCount?: number;
  leadSummary?: string;
}

export interface ToolAction {
  type: string;
  payload: string; // JSON string
}

export interface AgentReply {
  replyText: string;
  safetyFlag: boolean;
  confidenceScore: number;
  mediaUrl?: string;
  actions?: ToolAction[];
}

export interface SalesAgentService {
  generateReply(data: AgentRequest): Observable<AgentReply>;
}
