import { IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for creating a permission override for an organization member
 * Used in POST /organizations/:orgId/memberships/:membershipId/overrides
 */
export class CreatePermissionOverrideDto {
  @ApiProperty({
    description: 'The permission ID to override',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  permission_id: string;

  @ApiProperty({
    description: 'Whether to grant (true) or revoke (false) this permission',
    example: true,
  })
  @IsBoolean()
  is_granted: boolean;
}
