import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class AcceptClinicInvitationDto {
  @ApiProperty({
    description: 'Single-use clinic invitation token',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;

  @ApiPropertyOptional({ minLength: 12, maxLength: 72 })
  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;
}
