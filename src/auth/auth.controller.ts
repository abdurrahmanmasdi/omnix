import { Controller, Post, Body, Get, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UnauthorizedException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { Public } from './decorators/public/public.decorator';

interface IUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date;
}

interface ILoginResponse {
  access_token: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly i18n: I18nService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 201,
    description: 'Login successful, returns access token',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto): Promise<ILoginResponse> {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) {
      throw new UnauthorizedException(
        this.i18n.t('errors.AUTH.INVALID_CREDENTIALS'),
      );
    }
    return this.authService.login(user);
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
    );
    return user;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
  @ApiResponse({ status: 200, description: 'Current user information' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@Request() req: any): IUser {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return req.user as IUser;
  }
}
