import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Name of the role',
    example: 'Senior Manager',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}
