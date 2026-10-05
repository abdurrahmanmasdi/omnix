import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtUserGuard } from './guards/jwt-user.guard';
import { CustomThrottlerGuard } from '../core/guards/custom-throttler.guard';
import { REFRESH_COOKIE_NAME } from './cookie.helper';
import { UserProfileService } from './user-profile.service';
import {
  ChangePasswordDto,
  PasswordChangedDto,
  UpdateUserProfileDto,
  UserProfileDto,
} from './dto/user-profile.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtUserGuard)
@Controller('users/me')
export class UserProfileController {
  constructor(private readonly profiles: UserProfileService) {}
  @Get()
  @ApiOkResponse({ type: UserProfileDto })
  get(@Req() req: { user: { id: string } }) {
    return this.profiles.get(req.user.id);
  }
  @Patch()
  @ApiOkResponse({ type: UserProfileDto })
  update(
    @Req() req: { user: { id: string } },
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.profiles.update(req.user.id, dto);
  }
  @Post('password')
  @HttpCode(200)
  @ApiOkResponse({ type: PasswordChangedDto })
  @UseGuards(CustomThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @SkipThrottle({ loginIp: true, session: true })
  password(
    @Req()
    req: Request & { user: { id: string; organizationId: string | null } },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.profiles.changePassword(
      req.user.id,
      req.user.organizationId,
      req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined,
      dto,
    );
  }
}
