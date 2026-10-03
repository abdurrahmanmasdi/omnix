import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Liveness: the process is up (no dependency checks)',
  })
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness: database, Redis and the AI gRPC service',
  })
  @ApiResponse({ status: 200, description: 'All dependencies reachable' })
  @ApiResponse({
    status: 503,
    description: 'At least one dependency unreachable',
  })
  async readiness(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.readiness();
    res.status(result.ready ? 200 : 503);
    return {
      status: result.ready ? 'ready' : 'not_ready',
      checks: result.checks,
    };
  }
}
