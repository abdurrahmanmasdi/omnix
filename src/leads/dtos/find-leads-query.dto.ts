import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus, Priority } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { BaseQueryDto } from '../../common/query/dtos/query.dto';

export class FindLeadsQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}
