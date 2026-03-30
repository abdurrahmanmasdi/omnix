import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailingService {
  private readonly logger = new Logger(MailingService.name);

  async sendVerificationEmail(email: string, rawToken: string): Promise<void> {
    this.logger.log(
      `[MOCK] Verification email queued for ${email} with token ${rawToken}`,
    );
  }

  async sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
    this.logger.log(
      `[MOCK] Password reset email queued for ${email} with token ${rawToken}`,
    );
  }
}
