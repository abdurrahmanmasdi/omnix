import {
  Controller,
  Post,
  Body,
  Get,
  Request,
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
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    created_at: Date;
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
  async login(@Body() loginDto: LoginDto): Promise<ILoginResponse> {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) {
      throw new UnauthorizedException(
        this.i18n.t('auth.ERRORS.INVALID_CREDENTIALS'),
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
    @Request() req: any,
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
}
