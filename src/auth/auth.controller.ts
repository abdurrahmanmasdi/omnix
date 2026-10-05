import { getRefreshCookieOptions, REFRESH_COOKIE_NAME } from './cookie.helper';
import {
  Controller,
  Post,
  Body,
  Res,
  HttpStatus,
  HttpCode,
  Get,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ConsumeRecoveryDto } from './dto/consume-recovery.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../core/guards/custom-throttler.guard';
import { isProduction } from '../config/runtime';

// Session upkeep: own generous per-IP bucket instead of the strict auth/default ones.
const SESSION_ROUTE = { auth: true, default: true, session: false };

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(CustomThrottlerGuard)
@Throttle({ auth: { limit: 10, ttl: 60000 } })
@SkipThrottle({ loginIp: true, session: true })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({
    summary: 'Public signup is disabled during the invitation-only pilot',
  })
  @ApiResponse({
    status: 403,
    description: 'An operator invitation is required.',
  })
  signup() {
    return this.authService.signup();
  }

  @Post('login')
  @SkipThrottle({ loginIp: false })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in and receive access/refresh tokens' })
  @ApiResponse({
    status: 200,
    description: 'Successful login. Returns access token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.login(
      loginDto,
      req.headers['user-agent'],
      req.ip,
    );

    // Set the Refresh Token as an HttpOnly, Secure cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    // Send the Access Token in the JSON body so the frontend can store it in memory
    return {
      access_token: accessToken,
      user,
    };
  }

  @Post('logout')
  @SkipThrottle(SESSION_ROUTE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out and clear cookies' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    // This physically commands the browser to delete the HttpOnly cookie
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions(true));
    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
  @SkipThrottle(SESSION_ROUTE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using HTTP-only cookie' })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            locale: {
              type: 'string',
              enum: ['EN', 'TR', 'AR'],
              nullable: true,
            },
            id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            organizationId: { type: 'string', nullable: true },
            hasCompletedOnboarding: { type: 'boolean' },
          },
        },
      },
    },
  })
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() refreshDto: RefreshDto,
  ) {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;

    if (!refreshToken) {
      // If they have no cookie, they must log in again
      res
        .status(HttpStatus.UNAUTHORIZED)
        .send({ message: 'No refresh token found' });
      return;
    }

    try {
      const {
        accessToken,
        refreshToken: newRefreshToken,
        user,
      } = await this.authService.refreshTokens(
        refreshToken,
        req.headers['user-agent'],
        req.ip,
        // A body-less POST leaves the DTO undefined (KI-090).
        refreshDto?.organizationId,
      );

      // Rotate the refresh token for maximum security
      res.cookie(
        REFRESH_COOKIE_NAME,
        newRefreshToken,
        getRefreshCookieOptions(),
      );

      return { access_token: accessToken, user };
    } catch {
      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: isProduction(),
        sameSite: 'lax',
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  @Get('verify-email')
  @ApiOperation({
    summary: 'Legacy email verification is disabled during the pilot',
  })
  @ApiResponse({ status: 410, description: 'Use an operator invitation.' })
  async verifyEmail() {
    return this.authService.verifyEmail();
  }

  @Get('me')
  @SkipThrottle(SESSION_ROUTE)
  @UseGuards(JwtAuthGuard) // 🛡️ THE BOUNCER IS ACTIVE!
  @ApiBearerAuth() // Tells Swagger this route requires a token
  @ApiOperation({ summary: 'Get the currently logged-in user profile' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['user'],
      properties: {
        user: {
          type: 'object',
          required: ['id', 'locale'],
          properties: {
            id: { type: 'string' },
            locale: {
              type: 'string',
              enum: ['EN', 'TR', 'AR'],
              nullable: true,
            },
          },
        },
      },
    },
  })
  getProfile(@Req() req: Request) {
    // Because the Guard passed, `req.user` is guaranteed to exist and be valid!
    return {
      message: 'You have successfully bypassed the guard!',
      user: req.user,
    };
  }

  @Post('recovery/consume')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset password using a recovery token' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Password reset successfully',
  })
  async consumeRecovery(@Body() dto: ConsumeRecoveryDto): Promise<void> {
    await this.authService.consumeRecovery(dto);
  }
}
