import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ProposalStatus } from '@prisma/client';

export class UpdateProposalDto {
  @IsEnum(ProposalStatus)
  @IsOptional()
  status?: ProposalStatus;

  @IsUUID()
  @IsOptional()
  bank_account_id?: string;

  @IsNumber()
  @IsOptional()
  total_amount?: number;

  @IsString()
  @IsOptional()
  client_notes?: string;

  @IsBoolean()
  @IsOptional()
  client_accepted_privacy_policy?: boolean;
}
