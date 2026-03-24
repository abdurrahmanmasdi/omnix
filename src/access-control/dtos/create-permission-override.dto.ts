import { IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionOverrideDto {
  @ApiProperty({
    description: 'The permission ID to override',
    example: 'uuid-xxx',
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
