import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'Startup Inc.',
    description: 'The name of the organization',
  })
  @IsString()
  @IsNotEmpty({ message: 'Organization name cannot be empty' })
  name: string;
}
