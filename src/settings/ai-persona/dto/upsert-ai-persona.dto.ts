import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertAiPersonaDto {
  @ApiProperty({ description: 'Name of the clinic', example: 'Healthy Smile Dental' })
  @IsString()
  @IsNotEmpty()
  clinicName: string;

  @ApiPropertyOptional({ description: 'Name of the AI agent', example: 'Sarah' })
  @IsString()
  @IsOptional()
  agentName?: string;

  @ApiPropertyOptional({ description: 'Tone of the AI agent', example: 'Professional and empathetic' })
  @IsString()
  @IsOptional()
  tone?: string;

  @ApiPropertyOptional({ description: 'Message sent when handing off to a human', example: 'I will transfer you to our medical coordinator.' })
  @IsString()
  @IsOptional()
  handoffMessage?: string;

  @ApiPropertyOptional({ description: 'Dynamic workflow rules (JSON)' })
  @IsOptional()
  businessRules?: any;
}
