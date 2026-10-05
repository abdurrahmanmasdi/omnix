import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  BadRequestException,
  DefaultValuePipe,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @RequirePermissions('notifications:view')
  @Get()
  @ApiOperation({ summary: 'Get the authenticated user notifications' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Maximum number of notifications to return',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
          organizationId: {
            type: 'string',
            example: 'org-uuid',
          },
          userId: {
            type: 'string',
            example: 'user-uuid',
          },
          type: {
            type: 'string',
            example: 'LEAD_ASSIGNED',
          },
          code: { type: 'string', nullable: true },
          params: {
            type: 'object',
            nullable: true,
            additionalProperties: true,
          },
          title: {
            type: 'string',
            example: 'Lead ready for handoff',
          },
          body: {
            type: 'string',
            example: 'The AI handed off Abdulrahman and needs a human review.',
          },
          isRead: { type: 'boolean', example: false },
          referenceId: { type: 'string', nullable: true, example: 'lead-uuid' },
          referenceType: { type: 'string', nullable: true, example: 'LEAD' },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-05-12T10:00:00.000Z',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-05-12T10:00:00.000Z',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'User does not belong to any organization',
    schema: {
      example: {
        statusCode: 400,
        message: 'User does not belong to any organization',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('User does not belong to any organization');
    }
    return this.notificationsService.getUserNotifications(
      user.organizationId,
      user.id,
      limit,
    );
  }

  @RequirePermissions('notifications:view')
  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({
    status: 200,
    description: 'Unread notification count retrieved successfully',
    schema: {
      type: 'integer',
      example: 3,
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('User does not belong to any organization');
    }
    return this.notificationsService.getUnreadCount(
      user.organizationId,
      user.id,
    );
  }

  @RequirePermissions('notifications:manage')
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Notification UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', example: 1 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  markOneAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('User does not belong to any organization');
    }
    return this.notificationsService.markAsRead(
      user.organizationId,
      user.id,
      id,
    );
  }

  @RequirePermissions('notifications:manage')
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all unread notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'Unread notifications marked as read',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', example: 3 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('User does not belong to any organization');
    }
    return this.notificationsService.markAsRead(user.organizationId, user.id);
  }
}
