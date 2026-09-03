import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Istanbul Premium Hair' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'ist-premium-hair' })
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @ApiPropertyOptional({ example: 'MEDICAL_TOURISM' })
  @IsString()
  @IsOptional()
  industry_category?: string;

  @ApiPropertyOptional({ example: 'Professional and empathetic' })
  @IsString()
  @IsOptional()
  agentTone?: string;

  @ApiPropertyOptional({
    example: { rules: ['Must ask for patient age', 'Never promise specific results'] },
    description: 'JSON payload containing business rules for the AI',
  })
  @IsOptional()
  businessRules?: any;
}
