import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateLeadNoteDto {
  @ApiProperty({ example: 'Customer requested a follow-up call next week.' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
