import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  Res,
  Headers,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UnauthorizedException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { ResendVerificationDto } from './dtos/resend-verification.dto';
import { VerifyEmailDto } from './dtos/verify-email.dto';
import { RequestPasswordResetDto } from './dtos/request-password-reset.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { Public } from './decorators/public/public.decorator';

const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface IUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date;
  is_email_verified: boolean;
}

interface ILoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    created_at: Date;
    is_email_verified: boolean;
    permissions: string[];
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private readonly i18n: I18nService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 201,
    description:
      'Login successful, returns access token and user with permissions',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res?: ExpressResponse,
  ): Promise<ILoginResponse> {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) {
      throw new UnauthorizedException(
        this.i18n.t('auth.ERRORS.INVALID_CREDENTIALS'),
      );
    }

    return this.loginWithCookie(user, res);
  }

  @Public()
  @Post('verify-email')
  @ApiOperation({
    summary: 'Verify email using one-time token and issue session',
  })
  @ApiResponse({
    status: 201,
    description: 'Email verified and session issued',
  })
  async verifyEmail(
    @Body() verifyEmailDto: VerifyEmailDto,
    @Res({ passthrough: true }) res?: ExpressResponse,
  ): Promise<ILoginResponse> {
    const verificationResult = await this.authService.verifyEmail(
      verifyEmailDto.token,
    );
    this.setRefreshTokenCookie(res, verificationResult.refresh_token);

    return {
      access_token: verificationResult.access_token,
      user: verificationResult.user,
    };
  }

  @Public()
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiResponse({
    status: 201,
    description: 'Verification email dispatch attempted',
  })
  async resendVerification(
    @Body() resendVerificationDto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    return this.authService.resendVerification(resendVerificationDto.email);
  }

  @Public()
  @Post('request-password-reset')
  @ApiOperation({ summary: 'Request password reset token' })
  @ApiResponse({ status: 201, description: 'Password reset email dispatched' })
  async requestPasswordReset(
    @Body() requestPasswordResetDto: RequestPasswordResetDto,
  ): Promise<{ message: string }> {
    await this.authService.requestPasswordReset(requestPasswordResetDto.email);
    return { message: 'If this email exists, a reset link has been sent' };
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using one-time token' })
  @ApiResponse({ status: 201, description: 'Password reset successful' })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );

    return { message: 'Password reset successful' };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  @ApiResponse({ status: 201, description: 'Access token refreshed' })
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res?: ExpressResponse,
  ): Promise<{ access_token: string }> {
    const refreshToken = this.readRefreshToken(req);

    if (!refreshToken) {
      throw new UnauthorizedException(
        this.i18n.t('auth.ERRORS.INVALID_CREDENTIALS'),
      );
    }

    const rotatedTokens =
      await this.authService.refreshAccessToken(refreshToken);
    this.setRefreshTokenCookie(res, rotatedTokens.refresh_token);

    return {
      access_token: rotatedTokens.access_token,
    };
  }

  @Public()
  @Post('logout')
  @ApiOperation({
    summary: 'Logout by revoking refresh token and clearing cookie',
  })
  @ApiResponse({ status: 201, description: 'Logout successful' })
  async logout(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res?: ExpressResponse,
  ): Promise<{ message: string }> {
    const refreshToken = this.readRefreshToken(req);

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    this.clearRefreshTokenCookie(res);
    return { message: 'Logged out' };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'User registration' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({
    status: 400,
    description: 'User already exists or validation failed',
  })
  async register(@Body() registerDto: RegisterDto): Promise<IUser> {
    const user = await this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.first_name,
      registerDto.last_name,
      registerDto.inviteToken,
    );
    return user;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info with effective permissions' })
  @ApiResponse({
    status: 200,
    description:
      'Current user information with effective permissions for the organization (from x-organization-id header, optional)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(
    @Req() req: any,
    @Headers('x-organization-id') organizationId?: string,
  ): Promise<IUser & { permissions: string[] }> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const user = req.user as IUser;

    // If no organization ID provided, return empty permissions
    if (!organizationId) {
      this.logger.debug(
        `[AuthController] No organization ID in /me request for user ${user.id}, returning empty permissions`,
      );
      return {
        ...user,
        permissions: [],
      };
    }

    // Calculate effective permissions for the specified organization
    const userPermissions = await this.authService.getEffectivePermissions(
      user.id,
      organizationId,
    );

    return {
      ...user,
      permissions: userPermissions,
    };
  }

  private async loginWithCookie(
    user: IUser & { is_email_verified: boolean },
    res?: ExpressResponse,
  ): Promise<ILoginResponse> {
    const loginResult = await this.authService.login(user);
    this.setRefreshTokenCookie(res, loginResult.refresh_token);

    return {
      access_token: loginResult.access_token,
      user: loginResult.user,
    };
  }

  private setRefreshTokenCookie(
    res: ExpressResponse | undefined,
    refreshToken: string,
  ): void {
    if (!res || typeof res.cookie !== 'function') {
      return;
    }

    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_MAX_AGE_MS,
      path: '/',
    });
  }

  private clearRefreshTokenCookie(res?: ExpressResponse): void {
    if (!res || typeof res.clearCookie !== 'function') {
      return;
    }

    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }

  private readRefreshToken(req: ExpressRequest): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const refreshToken = cookies?.[REFRESH_TOKEN_COOKIE_NAME];

    return typeof refreshToken === 'string' ? refreshToken : undefined;
  }
}
