import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      // Guarded: token-protected or disabled in production (KI-033).
      controller: MetricsController,
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
})
export class MetricsModule {}
