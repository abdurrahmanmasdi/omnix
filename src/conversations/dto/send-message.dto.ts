import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Hello! I am taking over this chat.' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
