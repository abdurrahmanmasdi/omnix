import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePipelineStageDto {
  @ApiPropertyOptional({ example: 'Negotiation' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;
}
