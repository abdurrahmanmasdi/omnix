import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProposalStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { BaseQueryDto } from '../../common/query/dtos/query.dto';

export class FindProposalsQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: ProposalStatus })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;
}
