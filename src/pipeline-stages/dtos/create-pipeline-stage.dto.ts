import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class CreatePipelineStageDto {
  @ApiProperty({ example: 'Qualified' })
  @IsString()
  name: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  order_index: number;
}
