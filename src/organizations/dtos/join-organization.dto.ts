import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinOrganizationDto {
  @ApiProperty({
    example: 'acme-corporation',
    description: 'The URL-friendly slug of the organization to join',
  })
  @IsString({ message: 'Slug must be a string' })
  @MinLength(3, { message: 'Slug must be at least 3 characters long' })
  @MaxLength(255, { message: 'Slug must not exceed 255 characters' })
  slug: string;
}
