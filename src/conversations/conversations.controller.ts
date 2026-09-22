import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
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
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    if (!user.organizationId) {
      throw new Error('Organization ID not found');
    }
    return this.conversationsService.getConversations(
      user.organizationId,
      user.id,
      parseInt(page, 10),
      parseInt(limit, 10),
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
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    if (!user.organizationId) {
      throw new Error('Organization ID not found');
    }
    return this.conversationsService.getMessages(
      user.organizationId,
      user.id,
      conversationId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Post(':id/messages')
  @RequirePermissions('reply_conversations')
  @ApiOperation({ summary: 'Send a manual message to a conversation' })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    // You can define a detailed schema here if you want perfect Orval typing!
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

  @Patch(':id/toggle-ai')
  @RequirePermissions('manage_conversations')
  @ApiOperation({
    summary: 'Toggle the AI auto-reply state for a conversation',
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
