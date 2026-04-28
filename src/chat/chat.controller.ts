import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  Headers,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import {
  ChatService,
  type ConversationWithDetails,
  type MessageWithSender,
} from './chat.service';
import { CreateConversationDto } from './dtos/create-conversation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface SuccessResponse<T> {
  status: 'success';
  data: T;
}

interface AuthRequest extends ExpressRequest {
  user: { id: string };
}

@ApiTags('chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Get all conversations for the current user in an organization
   * @param req - Express request with authenticated user
   * @param orgId - Organization ID from x-organization-id header
   * @returns Array of conversations with latest message and participants
   */
  @Get('conversations')
  @ApiOperation({ summary: 'Get user conversations' })
  @ApiResponse({
    status: 200,
    description: 'List of conversations retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Missing organization ID header' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConversations(
    @Request() req: AuthRequest,
    @Headers('x-organization-id') orgId?: string,
  ): Promise<SuccessResponse<ConversationWithDetails[]>> {
    if (!orgId) {
      throw new BadRequestException(
        'Organization ID header (x-organization-id) is required',
      );
    }

    const conversations = await this.chatService.getUserConversations(
      req.user.id,
      orgId,
    );

    return {
      status: 'success',
      data: conversations,
    };
  }

  /**
   * Create a new 1-on-1 conversation (Direct Message)
   * Or return existing conversation if one already exists between the two users
   * @param req - Express request with authenticated user
   * @param orgId - Organization ID from x-organization-id header
   * @param createConversationDto - DTO containing targetUserId
   * @returns The created or existing conversation
   */
  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new 1-on-1 conversation' })
  @ApiResponse({
    status: 201,
    description: 'Conversation created or retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Missing organization ID header' })
  @ApiResponse({ status: 404, description: 'Target user not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createConversation(
    @Request() req: AuthRequest,
    @Headers('x-organization-id') orgId?: string,
    @Body() createConversationDto?: CreateConversationDto,
  ): Promise<SuccessResponse<ConversationWithDetails>> {
    if (!orgId) {
      throw new BadRequestException(
        'Organization ID header (x-organization-id) is required',
      );
    }

    const conversation = await this.chatService.createConversation(
      orgId,
      req.user.id,
      createConversationDto?.targetUserId || '',
    );

    return {
      status: 'success',
      data: conversation,
    };
  }

  /**
   * Get message history for a specific conversation
   * @param req - Express request with authenticated user
   * @param conversationId - The conversation ID
   * @returns Array of messages ordered by creation time
   */
  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Get conversation messages' })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Not a member of this conversation',
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConversationMessages(
    @Request() req: AuthRequest,
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<SuccessResponse<MessageWithSender[]>> {
    const messages = await this.chatService.getConversationMessages(
      conversationId,
      req.user.id,
      cursor,
      limit,
    );

    return {
      status: 'success',
      data: messages,
    };
  }
}
