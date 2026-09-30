import { Body, Controller, HttpCode, Post, UseGuards, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { IssueClinicInvitationDto } from './dto/issue-clinic-invitation.dto';
import { AcceptClinicInvitationDto } from './dto/accept-clinic-invitation.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './decorators/current-user.decorator';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../core/guards/custom-throttler.guard';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(CustomThrottlerGuard)
@Throttle({ auth: { limit: 10, ttl: 60000 } })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('accept-invitation')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Activate a pilot account using a single-use operator invitation',
  })
  @ApiResponse({
    status: 200,
    description: 'Account activated; log in to continue.',
  })
  @ApiResponse({
    status: 401,
    description: 'Invitation invalid, expired, revoked or consumed.',
  })
  accept(@Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(dto);
  }

  @Post('invitations/clinic')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('organization:manage')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Issue a clinic invitation to a new or existing user',
  })
  issueClinic(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IssueClinicInvitationDto,
  ) {
    if (!user.organizationId) {
      throw new Error('User does not belong to an organization');
    }
    return this.invitations.issueClinicInvitation(dto, user.id, user.organizationId);
  }

  @Post('invitations/clinic/accept')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Accept a clinic invitation',
  })
  acceptClinic(
    @CurrentUser() user: AuthenticatedUser | null,
    @Body() dto: AcceptClinicInvitationDto,
  ) {
    return this.invitations.acceptClinicInvitation(dto, user?.id);
  }
}
