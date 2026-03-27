import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessControlService } from './access-control.service';

@ApiTags('permissions')
@Controller('permissions')
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly accessControlService: AccessControlService) {}

  /**
   * Get all global system permissions
   * Sorted alphabetically by action for UI checklist rendering
   * Secured: Any authenticated user can view the global permissions list
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get all global system permissions',
    description:
      'Retrieves all available system permissions sorted alphabetically by action. Used for rendering permission checklists in role creation UI.',
  })
  @ApiResponse({
    status: 200,
    description: 'Permissions retrieved successfully',
    schema: {
      type: 'array',
      items: {
        properties: {
          id: { type: 'string', format: 'uuid' },
          action: { type: 'string', example: 'leads:create' },
          description: { type: 'string', nullable: true },
        },
      },
      example: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          action: 'leads:create',
          description: 'Create new leads',
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          action: 'leads:delete',
          description: 'Delete leads',
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllPermissions(): Promise<
    { id: string; action: string; description: string | null }[]
  > {
    // Guard verification ensures user is authenticated
    return this.accessControlService.getAllPermissions();
  }
}
