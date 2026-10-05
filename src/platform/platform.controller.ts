import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformThrottlerGuard } from './platform-throttler.guard';
import { PlatformService } from './platform.service';
import {
  PlatformClinicDto,
  PlatformEmailDto,
  PlatformInvitationDto,
  PlatformLinkDto,
  PlatformRevokedDto,
} from './platform.dto';
@ApiTags('Platform')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard, PlatformThrottlerGuard)
@Throttle({ auth: { limit: 10, ttl: 60000 } })
@SkipThrottle({ loginIp: true, session: true, default: true })
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}
  @Get('clinics')
  @ApiOkResponse({ type: [PlatformClinicDto] })
  clinics(@CurrentUser() user: AuthenticatedUser) {
    return this.platform.clinics(user.id);
  }
  @Get('invitations')
  @ApiOkResponse({ type: [PlatformInvitationDto] })
  invitations(@CurrentUser() user: AuthenticatedUser) {
    return this.platform.pending(user.id);
  }
  @Post('invitations')
  @ApiCreatedResponse({ type: PlatformLinkDto })
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PlatformEmailDto,
  ) {
    return this.platform.invite(dto.email, user.id);
  }
  @Post('invitations/:id/revoke')
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformRevokedDto })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.platform.revoke(id, user.id);
  }
  @Post('recovery')
  @ApiCreatedResponse({ type: PlatformLinkDto })
  recovery(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PlatformEmailDto,
  ) {
    return this.platform.recovery(dto.email, user.id);
  }
}
