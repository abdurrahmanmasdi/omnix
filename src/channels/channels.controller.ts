import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Channels')
@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  @ApiOperation({ summary: 'Connect a new communication channel (e.g., WhatsApp)' })
  @ApiResponse({ status: 201, description: 'Channel connected successfully' })
  async createChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateChannelDto,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization not found for the user');
    }
    return this.channelsService.createChannel(user.organizationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all connected channels for the organization' })
  @ApiResponse({ status: 200, description: 'List of channels' })
  async getChannels(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization not found for the user');
    }
    return this.channelsService.getChannels(user.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Disconnect a channel' })
  @ApiResponse({ status: 200, description: 'Channel disconnected successfully' })
  async deleteChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') channelId: string,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization not found for the user');
    }
    return this.channelsService.deleteChannel(user.organizationId, channelId);
  }
}
