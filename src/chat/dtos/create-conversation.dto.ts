import { IsUUID, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @IsUUID()
  @IsOptional()
  leadId?: string;

  @IsString()
  @IsOptional()
  externalContactId?: string;
}
