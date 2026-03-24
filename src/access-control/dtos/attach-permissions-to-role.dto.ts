import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AttachPermissionsToRoleDto {
  @ApiProperty({
    description: 'Array of permission IDs to attach to the role',
    example: ['uuid-1', 'uuid-2'],
    isArray: true,
  })
  @IsArray()
  @IsUUID('4', { each: true })
  permission_ids: string[];
}
