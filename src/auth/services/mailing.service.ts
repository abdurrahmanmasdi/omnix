import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailingService {
  private readonly logger = new Logger(MailingService.name);

  constructor(private readonly configService: ConfigService) {}

  sendVerificationEmail(email: string, rawToken: string): Promise<void> {
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001'
    )
      .trim()
      .replace(/\/$/, '');
    const verificationUrl = `${frontendUrl}/auth/verify-email?token=${rawToken}`;

    const smtpEnabled =
      this.configService.get<boolean>('SMTP_ENABLED') === true;
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const shouldDispatchEmail = smtpEnabled || nodeEnv === 'production';

    if (shouldDispatchEmail) {
      this.logger.log(
        `[MOCK SMTP] Verification email dispatched to ${email} with link ${verificationUrl}`,
      );

      return Promise.resolve();
    }

    this.logger.log(`[DEV MODE] Email Verification Link: ${verificationUrl}`);

    return Promise.resolve();
  }

  sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001'
    )
      .trim()
      .replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${rawToken}`;

    const smtpEnabled =
      this.configService.get<boolean>('SMTP_ENABLED') === true;
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const shouldDispatchEmail = smtpEnabled || nodeEnv === 'production';

    if (shouldDispatchEmail) {
      this.logger.log(
        `[MOCK SMTP] Password reset email dispatched to ${email} with link ${resetUrl}`,
      );

      return Promise.resolve();
    }

    this.logger.log(`[DEV MODE] Password Reset Link generated: ${resetUrl}`);

    return Promise.resolve();
  }
}
