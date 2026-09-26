import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@ApiTags('Authentication')
@Controller('auth')
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
}
