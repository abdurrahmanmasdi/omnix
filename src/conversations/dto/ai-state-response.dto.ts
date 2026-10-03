import { ApiProperty } from '@nestjs/swagger';

export class AiStateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  aiPaused: boolean;
}
