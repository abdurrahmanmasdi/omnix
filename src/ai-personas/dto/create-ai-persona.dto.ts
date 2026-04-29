import {
  IsUUID,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAiPersonaDto {
  @ApiProperty({
    description: 'Organization UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({
    description: 'System prompt for the AI persona',
    example: 'You are a helpful sales assistant for our company...',
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  systemPrompt!: string;

  @ApiPropertyOptional({
    description: 'Display name for the AI persona',
    example: 'Sales Assistant',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Voice ID for text-to-speech (ElevenLabs or OpenAI)',
    example: 'en-US-Neural2-C',
  })
  @IsString()
  @IsOptional()
  voiceId?: string;

  @ApiPropertyOptional({
    description: 'Whether the AI persona can negotiate',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  canNegotiate?: boolean;

  @ApiPropertyOptional({
    description: 'Automatically attend to new leads',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  autoAttendNewLeads?: boolean;

  @ApiPropertyOptional({
    description: 'Speed of outbound messages (0-100)',
    example: 50,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  outboundMessagesSpeed?: number;

  @ApiPropertyOptional({
    description: 'Sleep start time (HH:MM format)',
    example: '23:00',
  })
  @IsString()
  @IsOptional()
  sleepStartHour?: string;

  @ApiPropertyOptional({
    description: 'Sleep end time (HH:MM format)',
    example: '08:00',
  })
  @IsString()
  @IsOptional()
  sleepEndHour?: string;
}
