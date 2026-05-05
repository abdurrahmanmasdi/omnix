import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './events/events.gateway';

@Module({
  imports: [JwtModule.register({})], // Inject JWT functionality
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
