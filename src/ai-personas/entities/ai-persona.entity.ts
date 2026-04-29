import { ApiProperty } from '@nestjs/swagger';

export class AiPersona {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  organization_id!: string;

  @ApiProperty({ example: 'Sales Assistant' })
  name!: string;

  @ApiProperty({ example: 'en-US-Neural2-C', nullable: true })
  voice_id?: string | null;

  @ApiProperty({
    example: 'You are a helpful sales assistant...',
    nullable: true,
  })
  system_prompt?: string | null;

  @ApiProperty({ example: false })
  can_negotiate!: boolean;

  @ApiProperty({ example: true })
  auto_attend_new_leads!: boolean;

  @ApiProperty({ example: 50 })
  outbound_messages_speed!: number;

  @ApiProperty({ example: '23:00', nullable: true })
  sleep_start_hour?: string | null;

  @ApiProperty({ example: '08:00', nullable: true })
  sleep_end_hour?: string | null;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;
}
