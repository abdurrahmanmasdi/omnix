import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class BaseQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    example:
      '{"logicalOperator":"AND","conditions":[{"field":"status","operator":"equals","value":"NEW"}]}',
    description:
      'A JSON-stringified AST for filtering with AND/OR logic and dynamic operators.',
  })
  @IsOptional()
  @IsString()
  filters?: string;

  @ApiPropertyOptional({
    example: '[{"field":"createdAt","direction":"desc"}]',
    description: 'A JSON-stringified array of sort nodes.',
  })
  @IsOptional()
  @IsString()
  sorts?: string;
}
