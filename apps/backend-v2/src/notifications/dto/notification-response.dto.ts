import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'org-uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'user-uuid' })
  userId!: string;

  @ApiProperty({
    enum: NotificationType,
    example: NotificationType.LEAD_ASSIGNED,
  })
  type!: NotificationType;

  @ApiPropertyOptional({ nullable: true, example: 'LEAD_HANDED_OFF' })
  code?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  params?: Record<string, unknown> | null;

  @ApiProperty({ example: 'Lead ready for handoff' })
  title!: string;

  @ApiProperty({
    example: 'The AI handed off Abdulrahman and needs a human review.',
  })
  body!: string;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: 'lead-uuid',
  })
  referenceId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'LEAD',
  })
  referenceType?: string | null;

  @ApiProperty({ example: '2026-05-12T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-05-12T10:00:00.000Z' })
  updatedAt!: Date;
}

export class NotificationMutationResponseDto {
  @ApiProperty({ example: 1 })
  count!: number;
}
