import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './create-organization.dto';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Organizations')
@ApiBearerAuth() // Adds the Lock icon so you can pass your JWT
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // This decorator locks the route
  @ApiOperation({ summary: 'Create a new organization' })
  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(
    @Request() req: { user: { userId: string; email: string } },
    @Body() createOrgDto: CreateOrganizationDto,
  ) {
    // req.user.userId comes directly from the verified JWT!
    return this.organizationsService.create(req.user.userId, createOrgDto);
  }

  @ApiOperation({ summary: 'Get all organizations for the logged-in user' })
  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll(@Request() req: { user: { userId: string; email: string } }) {
    return this.organizationsService.findAllForUser(req.user.userId);
  }
}
