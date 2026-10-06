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
import { EmbeddedSignupService } from './embedded-signup.service';
import {
  EmbeddedSignupDto,
  EmbeddedSignupConfigDto,
} from './dto/embedded-signup.dto';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Channels')
@Controller('channels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly embeddedSignup: EmbeddedSignupService,
  ) {}

  @Get('embedded-signup/config')
  @RequirePermissions('manage_channels')
  @ApiResponse({ status: 200, type: EmbeddedSignupConfigDto })
  getEmbeddedSignupConfig() {
    return this.embeddedSignup.configuration();
  }

  @Post('embedded-signup')
  @RequirePermissions('manage_channels')
  connectEmbeddedSignup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EmbeddedSignupDto,
  ) {
    if (!user.organizationId)
      throw new BadRequestException('Organization not found for the user');
    return this.embeddedSignup.connect(user.organizationId, dto.code);
  }

  @Post()
  @RequirePermissions('manage_channels')
  @ApiOperation({
    summary: 'Connect a new communication channel (e.g., WhatsApp)',
  })
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
  @RequirePermissions('view_channels')
  @ApiOperation({ summary: 'Get all connected channels for the organization' })
  @ApiResponse({ status: 200, description: 'List of channels' })
  async getChannels(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization not found for the user');
    }
    return this.channelsService.getChannels(user.organizationId);
  }

  @Post(':id/verify')
  @RequirePermissions('manage_channels')
  verifyConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    if (!user.organizationId)
      throw new BadRequestException('Organization not found for the user');
    return this.channelsService.verifyConnection(user.organizationId, id);
  }

  @Delete(':id')
  @RequirePermissions('manage_channels')
  @ApiOperation({ summary: 'Disconnect a channel' })
  @ApiResponse({
    status: 200,
    description: 'Channel disconnected successfully',
  })
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
