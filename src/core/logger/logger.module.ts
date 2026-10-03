import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { isProduction } from '../../config/runtime';

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        autoLogging: false,
        genReqId: () => randomUUID(),
        redact: {
          paths: [
            'req.url',
            'req.query',
            'req.body',
            'req.rawBody',
            'req.headers',
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.token',
            'req.body.accessToken',
            'req.body.refreshToken',
            'req.body.email',
            'req.body.phoneNumber',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
        transport: !isProduction()
          ? {
              target: 'pino-pretty',
              options: {
                singleLine: true,
              },
            }
          : undefined,
      },
    }),
  ],
})
export class LoggerModule {}
