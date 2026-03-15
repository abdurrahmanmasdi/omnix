import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({
    example: 'inv_1234567890',
    description: 'The invitation token',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token: string;
}
