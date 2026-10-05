import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class PlatformAccessService {
  constructor(private readonly config: ConfigService) {}
  allows(user: { email: string; status?: string }) {
    const emails = this.config.get<string>('PLATFORM_ADMIN_EMAILS') ?? '';
    return (
      user.status === 'ACTIVE' &&
      emails
        .split(',')
        .some(
          (email) => email.trim().toLowerCase() === user.email.toLowerCase(),
        )
    );
  }
}
