import { ConfigService } from '@nestjs/config';
import { PlatformAccessService } from './platform-access.service';
describe('platform allowlist', () => {
  it.each([undefined, '', 'other@example.invalid'])(
    'defaults to no platform access with %s',
    (emails) => {
      const access = new PlatformAccessService(
        new ConfigService({ PLATFORM_ADMIN_EMAILS: emails }),
      );
      expect(
        access.allows({ email: 'founder@example.invalid', status: 'ACTIVE' }),
      ).toBe(false);
    },
  );
  it('matches a complete email case-insensitively only for active users', () => {
    const access = new PlatformAccessService(
      new ConfigService({
        PLATFORM_ADMIN_EMAILS:
          ' staff@example.invalid, FOUNDER@example.invalid ',
      }),
    );
    expect(
      access.allows({ email: 'founder@example.invalid', status: 'ACTIVE' }),
    ).toBe(true);
    expect(
      access.allows({ email: 'founder@example.invalid', status: 'SUSPENDED' }),
    ).toBe(false);
    expect(
      access.allows({
        email: 'founder@example.invalid.evil',
        status: 'ACTIVE',
      }),
    ).toBe(false);
  });
});
