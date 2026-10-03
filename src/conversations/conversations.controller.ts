import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { SendMessageDto } from './dto/send-message.dto';
import { AiStateResponseDto } from './dto/ai-state-response.dto';
import { ManualMessageResponseDto } from './dto/manual-message-response.dto';

import {
  PaginationQueryDto,
  CursorPaginationQueryDto,
} from './dto/pagination.dto';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @RequirePermissions('view_conversations')
  @ApiOperation({ summary: 'Get a list of conversations for the organization' })
  @ApiResponse({
    status: 200,
    description: 'Returns conversations with their latest message preview',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          updatedAt: { type: 'string', format: 'date-time' },
          lead: {
            type: 'object',
            nullable: true,
            properties: {
              name: { type: 'string' },
              phoneNumber: { type: 'string' },
            },
          },
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                content: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  })
  async getConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    if (!user.organizationId) {
      throw new Error('Organization ID not found');
    }
    return this.conversationsService.getConversations(
      user.organizationId,
      user.id,
      query.page || 1,
      query.limit || 20,
    );
  }

  @Get(':id/messages')
  @RequirePermissions('view_conversations')
  @ApiOperation({
    summary: 'Get paginated messages for a specific conversation',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns history of messages',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { type: 'string' },
          type: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async getMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    if (!user.organizationId) {
      throw new Error('Organization ID not found');
    }
    return this.conversationsService.getMessages(
      user.organizationId,
      user.id,
      conversationId,
      query.cursor,
      query.limit || 50,
    );
  }

  @Post(':id/messages')
  @RequirePermissions('reply_conversations')
  @ApiOperation({ summary: 'Send a manual message to a conversation' })
  @ApiResponse({
    status: 201,
    description:
      'Message created and handed to WhatsApp; deliveryStatus is SENT, UNKNOWN (check WhatsApp before resending) or FAILED. warnings lists non-blocking notices (PATIENT_OPTED_OUT).',
    type: ManualMessageResponseDto,
  })
  @ApiResponse({
    status: 422,
    description:
      'Not sent. code: OUTSIDE_24H_WINDOW, CHANNEL_UNAVAILABLE, NO_CONTACT, CLINIC_INACTIVE (an opt-out never blocks a staff send)',
  })
  @ApiResponse({
    status: 409,
    description:
      'Not sent: the conversation changed during the send (code DELIVERY_NOT_AUTHORIZED)',
  })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    if (!user.organizationId) {
      throw new Error('Organization ID not found');
    }
    return this.conversationsService.sendManualMessage(
      user.organizationId,
      user.id,
      conversationId,
      dto.content,
    );
  }

  @Post(':id/ai-pause')
  @HttpCode(200)
  @RequirePermissions('manage_conversations')
  @ApiOperation({
    summary: 'Pause the AI for a conversation (idempotent)',
  })
  @ApiResponse({ status: 200, type: AiStateResponseDto })
  async pauseAi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
  ): Promise<AiStateResponseDto> {
    if (!user.organizationId) {
      throw new Error('Organization ID not found');
    }
    return this.conversationsService.setAiPaused(
      user.organizationId,
      user.id,
      conversationId,
      true,
    );
  }

  @Post(':id/ai-resume')
  @HttpCode(200)
  @RequirePermissions('manage_conversations')
  @ApiOperation({
    summary: 'Resume the AI for a conversation (idempotent)',
  })
  @ApiResponse({ status: 200, type: AiStateResponseDto })
  async resumeAi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
  ): Promise<AiStateResponseDto> {
    if (!user.organizationId) {
      throw new Error('Organization ID not found');
    }
    return this.conversationsService.setAiPaused(
      user.organizationId,
      user.id,
      conversationId,
      false,
    );
  }

  @Patch(':id/toggle-ai')
  @RequirePermissions('manage_conversations')
  @ApiOperation({
    summary:
      'Deprecated: toggle the AI state. Use POST ai-pause / ai-resume instead.',
    deprecated: true,
  })
  @ApiResponse({
    status: 200,
    description: 'AI state toggled successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        aiPaused: { type: 'boolean' },
      },
    },
  })
  async toggleAi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
  ) {
    if (!user.organizationId) {
      throw new Error('Organization ID not found');
    }
    return this.conversationsService.toggleAiState(
      user.organizationId,
      user.id,
      conversationId,
    );
  }
}
