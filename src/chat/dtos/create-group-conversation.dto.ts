import {
  IsString,
  IsArray,
  IsUUID,
  IsNotEmpty,
  ArrayMinSize,
} from 'class-validator';

export class CreateGroupConversationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1, { message: 'At least one participant must be included' })
  participantIds: string[];
}
