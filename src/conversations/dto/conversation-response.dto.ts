import { ApiProperty } from '@nestjs/swagger';

export class InboxMessageDto {
  @ApiProperty() id: string;
  @ApiProperty() conversationId: string;
  @ApiProperty({ type: String, nullable: true }) senderId: string | null;
  @ApiProperty() content: string;
  @ApiProperty({ type: String, nullable: true }) mediaUrl: string | null;
  @ApiProperty() type: string;
  @ApiProperty() handledBy: string;
  @ApiProperty({
    description:
      'Delivery/processing state. UNKNOWN is preserved from the outbound attempt.',
  })
  status: string;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
export class InboxPatientDto {
  @ApiProperty() id: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() phoneNumber: string;
  @ApiProperty({ type: String, nullable: true }) email: string | null;
  @ApiProperty() primaryLanguage: string;
  @ApiProperty() country: string;
  @ApiProperty() timezone: string;
  @ApiProperty() status: string;
  @ApiProperty() priority: string;
  @ApiProperty({ type: String, nullable: true }) assignedAgentId: string | null;
  @ApiProperty({ type: String, nullable: true }) assigneeName: string | null;
  @ApiProperty({ type: String, nullable: true }) pipelineStageId: string | null;
  @ApiProperty({ type: String, nullable: true }) stageName: string | null;
  @ApiProperty({ type: String, nullable: true }) summary: string | null;
  @ApiProperty() optedOut: boolean;
}
export class InboxConversationDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty({ type: String, nullable: true }) leadId: string | null;
  @ApiProperty({ type: String, nullable: true }) channelId: string | null;
  @ApiProperty() status: string;
  @ApiProperty() aiPaused: boolean;
  @ApiProperty() stateVersion: number;
  @ApiProperty({ type: String, nullable: true }) assignedAgentId: string | null;
  @ApiProperty({ type: String, nullable: true }) externalContactId:
    | string
    | null;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
  @ApiProperty({ type: InboxPatientDto, nullable: true })
  lead: InboxPatientDto | null;
  @ApiProperty({ type: [InboxMessageDto] }) messages: InboxMessageDto[];
}
export class InboxMessagesPageDto {
  @ApiProperty({ type: [InboxMessageDto] }) data: InboxMessageDto[];
  @ApiProperty() hasMore: boolean;
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}

export class InboxSendErrorDto {
  @ApiProperty() code: string;
  @ApiProperty() message: string;
}
