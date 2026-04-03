import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProposalLineItemDto {
  @IsUUID()
  @IsOptional()
  product_id?: string;

  @IsUUID()
  @IsOptional()
  instance_id?: string;

  @IsString()
  @IsOptional()
  start_date?: string;

  @IsString()
  @IsOptional()
  end_date?: string;

  @IsString()
  custom_name!: string;

  @IsNumber()
  unit_price!: number;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsArray()
  @IsObject({ each: true })
  @IsOptional()
  selected_addons?: Record<string, any>[];
}

export class CreateProposalDto {
  @IsUUID()
  lead_id!: string;

  @IsUUID()
  created_by_id!: string;

  @IsUUID()
  @IsOptional()
  bank_account_id?: string;

  @IsNumber()
  total_amount!: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  client_notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProposalLineItemDto)
  line_items!: CreateProposalLineItemDto[];
}
