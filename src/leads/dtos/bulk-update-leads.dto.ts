import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus, Priority } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmptyObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkUpdateLeadDataDto {
  @ApiProperty({ enum: LeadStatus, required: false })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiProperty({ enum: Priority, required: false })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiProperty({
    example: 'f9ce8f72-9ec8-4db0-bf07-614ec2ec6143',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4')
  assigned_agent_id?: string | null;
}

export class BulkUpdateLeadsDto {
  @ApiProperty({
    type: [String],
    example: [
      'c7fce87c-5ef2-4ed2-929e-67b703796790',
      '7d98e03d-8f94-4dc1-9d97-d65f06a24a87',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  lead_ids: string[];

  @ApiProperty({
    type: BulkUpdateLeadDataDto,
    example: {
      status: 'WON',
      assigned_agent_id: 'f9ce8f72-9ec8-4db0-bf07-614ec2ec6143',
    },
  })
  @ValidateNested()
  @Type(() => BulkUpdateLeadDataDto)
  @IsNotEmptyObject()
  update_data: BulkUpdateLeadDataDto;
}
