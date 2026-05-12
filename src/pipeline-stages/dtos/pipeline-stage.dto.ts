import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePipelineStageDto {
  @ApiProperty({ example: 'Initial Contact' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description:
      'Optional: If omitted, it will be placed at the end of the pipeline.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

export class UpdatePipelineStageDto extends PartialType(
  CreatePipelineStageDto,
) {}

export class ReorderStageItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  orderIndex!: number;
}

export class BulkReorderStagesDto {
  @ApiProperty({ type: [ReorderStageItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderStageItemDto)
  stages!: ReorderStageItemDto[];
}
