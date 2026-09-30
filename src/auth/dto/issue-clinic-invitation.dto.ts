import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID } from 'class-validator';

export class IssueClinicInvitationDto {
  @ApiProperty({ description: 'Email address of the staff to invite' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Role ID to grant upon acceptance' })
  @IsUUID()
  roleId!: string;
}
