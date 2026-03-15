import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './create-invitation.dto';
import { AuthGuard } from '@nestjs/passport';
import { AcceptInvitationDto } from './accept-invitation.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Invitations')
@Controller('invitations')
@ApiBearerAuth()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @ApiOperation({ summary: 'Create a new invitation' })
  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(
    @Request() req: { user: { userId: string; email: string } },
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.createInvite(
      req.user.userId,
      dto.email,
      dto.organizationId,
      dto.role,
    );
  }

  @ApiOperation({ summary: 'Accept an invitation' })
  @UseGuards(AuthGuard('jwt'))
  @Post('accept')
  accept(
    @Request() req: { user: { userId: string; email: string } },
    @Body() dto: AcceptInvitationDto,
  ) {
    // We pass both the userId and the email from the verified JWT
    return this.invitationsService.acceptInvite(
      req.user.userId,
      req.user.email,
      dto.token,
    );
  }
}
