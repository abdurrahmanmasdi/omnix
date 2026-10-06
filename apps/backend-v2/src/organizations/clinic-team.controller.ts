import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  Controller,
  Patch,
  Delete,
  Body,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClinicTeamService } from './clinic-team.service';
import {
  ClinicMemberDto,
  ChangeClinicMemberRoleDto,
  ClinicMemberChangedDto,
  PendingClinicInvitationDto,
  GrantableClinicRoleDto,
  ClinicInvitationRevokedDto,
} from './dto/clinic-team.dto';

@ApiTags('Clinic Team')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('organization:manage')
@Controller('organizations/current')
export class ClinicTeamController {
  constructor(private readonly team: ClinicTeamService) {}
  @Patch('members/:membershipId')
  @ApiOkResponse({ type: ClinicMemberChangedDto })
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Body() dto: ChangeClinicMemberRoleDto,
  ) {
    return this.team.changeMember(
      user.organizationId!,
      id,
      user.id,
      dto.roleId,
    );
  }
  @Delete('members/:membershipId')
  @ApiOkResponse({ type: ClinicMemberChangedDto })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
  ) {
    return this.team.changeMember(user.organizationId!, id, user.id);
  }
  @Get('members')
  @ApiOkResponse({ type: [ClinicMemberDto] })
  members(@CurrentUser() user: AuthenticatedUser) {
    return this.team.members(user.organizationId!);
  }
  @Get('invitations')
  @ApiOkResponse({ type: [PendingClinicInvitationDto] })
  invitations(@CurrentUser() user: AuthenticatedUser) {
    return this.team.invitations(user.organizationId!);
  }
  @Get('roles')
  @ApiOkResponse({ type: [GrantableClinicRoleDto] })
  roles(@CurrentUser() user: AuthenticatedUser) {
    return this.team.roles(user.id, user.organizationId!);
  }
  @Post('invitations/:id/revoke')
  @HttpCode(200)
  @ApiOkResponse({ type: ClinicInvitationRevokedDto })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.revoke(user.organizationId!, id, user.id);
  }
}
