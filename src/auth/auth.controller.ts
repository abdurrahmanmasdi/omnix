import { getRefreshCookieOptions, REFRESH_COOKIE_NAME } from "./cookie.helper";
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
  Query,
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
import { SignupDto } from './dto/signup.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({
    summary: 'Register a new user account (No Organization yet)',
  })
  @ApiResponse({ status: 201, description: 'User created successfully.' })
  @ApiResponse({ status: 409, description: 'Email already exists.' })
  async signup(
    @Body() signupDto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.signup(signupDto);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    return { access_token: accessToken, user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in and receive access/refresh tokens' })
  @ApiResponse({
    status: 200,
    description: 'Successful login. Returns access token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(loginDto);

    // Set the Refresh Token as an HttpOnly, Secure cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    // Send the Access Token in the JSON body so the frontend can store it in memory
    return {
      access_token: accessToken,
      user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out and clear cookies' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  logout(@Res({ passthrough: true }) res: Response) {
    // This physically commands the browser to delete the HttpOnly cookie
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions(true));
    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
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
  ) {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;

    if (!refreshToken) {
      // If they have no cookie, they must log in again
      res
        .status(HttpStatus.UNAUTHORIZED)
        .send({ message: 'No refresh token found' });
      return;
    }

    const {
      accessToken,
      refreshToken: newRefreshToken,
      user,
    } = await this.authService.refreshTokens(refreshToken);

    // Rotate the refresh token for maximum security
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getRefreshCookieOptions());

    return { access_token: accessToken, user };
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify user email using the token sent via email' })
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard) // 🛡️ THE BOUNCER IS ACTIVE!
  @ApiBearerAuth() // Tells Swagger this route requires a token
  @ApiOperation({ summary: 'Get the currently logged-in user profile' })
  getProfile(@Req() req: Request) {
    // Because the Guard passed, `req.user` is guaranteed to exist and be valid!
    return {
      message: 'You have successfully bypassed the guard!',
      user: req.user,
    };
  }
}
