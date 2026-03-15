import { IsEmail, IsUUID, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({
    example: 'founder@startup.com',
    description: 'The user account email',
  })
  @IsEmail({}, { message: 'Must be a valid email' })
  email: string;

  @ApiProperty({
    example: 'org_1234567890',
    description: 'The organization ID',
  })
  @IsUUID('4', { message: 'Invalid Organization ID' })
  organizationId: string;

  @ApiProperty({
    example: 'ADMIN',
    description: 'The role assigned to the invited user (OWNER, ADMIN, MEMBER)',
  })
  @IsEnum(Role, { message: 'Role must be OWNER, ADMIN, or MEMBER' })
  role: Role;
}
