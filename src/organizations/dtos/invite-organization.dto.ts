import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteToOrganizationDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'The email address of the user to invite',
  })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email: string;
}
