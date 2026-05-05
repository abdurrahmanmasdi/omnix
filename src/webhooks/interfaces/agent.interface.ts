import { Observable } from 'rxjs';

export interface AgentRequest {
  organizationId: string;
  conversationId: string;
  latestMessage: string;
}

export interface AgentReply {
  replyText: string;
}

export interface SalesAgentService {
  generateReply(data: AgentRequest): Observable<AgentReply>;
}
