import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'founder@startup.com',
    description: 'The user account email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'SuperSecret123!',
    description: 'The user account password',
  })
  @IsString()
  password: string;
}
