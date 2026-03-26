import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for assigning a role to an organization member
 * Used in PATCH /organizations/:orgId/memberships/:membershipId/role
 */
export class UpdateMemberRoleDto {
  @ApiProperty({
    description: 'The role ID to assign to this membership',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  role_id: string;
}
