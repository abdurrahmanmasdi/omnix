import { PartialType } from '@nestjs/swagger';
import { CreateAiPersonaDto } from './create-ai-persona.dto';
import { IsUUID, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAiPersonaDto extends PartialType(CreateAiPersonaDto) {
  @ApiPropertyOptional({
    description: 'Organization UUID - cannot be updated',
  })
  @IsUUID()
  @IsOptional()
  organizationId?: never;
}
