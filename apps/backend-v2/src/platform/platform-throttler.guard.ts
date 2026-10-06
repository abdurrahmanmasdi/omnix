import { Injectable } from '@nestjs/common';
import { CustomThrottlerGuard } from '../core/guards/custom-throttler.guard';
@Injectable()
export class PlatformThrottlerGuard extends CustomThrottlerGuard {
  protected async getTracker(req: {
    user?: { id: string };
    ip?: string;
  }): Promise<string> {
    return req.user?.id ?? 'unknown';
  }
}
