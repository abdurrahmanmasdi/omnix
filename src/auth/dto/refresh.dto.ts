import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshDto {
  @ApiPropertyOptional({
    description: 'The target organization to select (for multi-tenant users)',
  })
  @IsString()
  @IsOptional()
  organizationId?: string;
}
