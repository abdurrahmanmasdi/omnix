import { Observable } from 'rxjs';

export interface AgentRequest {
  contractVersion?: number;
  organizationId: string;
  conversationId: string;
  newMessageIds: string[];
  clinicName?: string;
  agentTone?: string;
  businessRulesJson?: string;
  imageBase64?: string;
  audioBase64?: string;
  totalMessageCount?: number;
  leadSummary?: string;
  isFollowUp?: boolean;
  followUpContext?: string;
}

export type AgentActionType =
  | 'CREATE_LEAD' | 'UPDATE_LEAD' | 'UPDATE_SUMMARY'
  | 'HANDOFF_TO_HUMAN' | 'PAUSE_CONVERSATION'
  | 'NOTIFY_AGENT' | 'SCHEDULE_FOLLOW_UP';

export interface ToolActionWire {
  type: string;
  payload: string;
}

export interface ToolAction extends ToolActionWire {
  type: AgentActionType;
  payload: string; // protobuf wire representation of the typed action payload
}

export interface AgentReply {
  contractVersion?: number;
  replyText: string;
  safetyFlag: boolean;
  confidenceScore: number;
  mediaUrl?: string;
  actions?: ToolAction[];
}

export interface SalesAgentService {
  generateReply(data: AgentRequest): Observable<AgentReply>;
}
