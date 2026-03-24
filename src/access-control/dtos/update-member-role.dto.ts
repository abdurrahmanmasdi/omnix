import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMemberRoleDto {
  @ApiProperty({
    description: 'The new role ID to assign to this member',
    example: 'uuid-xxx',
  })
  @IsUUID()
  role_id: string;
}
