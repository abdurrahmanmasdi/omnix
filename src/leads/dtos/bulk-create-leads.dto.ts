import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateLeadDto } from './create-lead.dto';

export class BulkCreateLeadsDto {
  @ApiProperty({
    type: [CreateLeadDto],
    description: 'Array of leads to create (max 500 items per request)',
    minItems: 1,
    maxItems: 500,
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'leads must contain at least 1 item',
  })
  @ArrayMaxSize(500, {
    message: 'leads must not exceed 500 items',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateLeadDto)
  leads: CreateLeadDto[];
}
