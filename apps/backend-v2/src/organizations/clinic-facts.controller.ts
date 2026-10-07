import {
  Body,
  Controller,
  Get,
  Put,
  Post,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ClinicFactsService } from './clinic-facts.service';
import {
  ApproveClinicFactsDto,
  ClinicFactRevisionDto,
  ClinicFactSheetDto,
  SaveClinicFactsDto,
} from './dto/clinic-facts.dto';

@ApiTags('Clinic Facts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('organization:manage')
@Controller('organizations/current/clinic-facts')
export class ClinicFactsController {
  constructor(private readonly facts: ClinicFactsService) {}
  @Get()
  @ApiOkResponse({ type: ClinicFactSheetDto })
  read(@CurrentUser() user: AuthenticatedUser) {
    return this.facts.read(user.organizationId!, user.id);
  }
  @Put()
  @ApiOkResponse({ type: ClinicFactRevisionDto })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveClinicFactsDto,
  ) {
    return this.facts.save(user.organizationId!, user.id, dto);
  }
  @Post('approve')
  @HttpCode(200)
  @ApiOkResponse({ type: ClinicFactRevisionDto })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApproveClinicFactsDto,
  ) {
    return this.facts.approve(user.organizationId!, user.id, dto.version);
  }
}
