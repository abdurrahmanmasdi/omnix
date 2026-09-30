import { Module } from '@nestjs/common';
import { ExperiencesService } from './experiences.service';
import { ExperiencesController } from './experiences.controller';
import { AuthModule } from '../auth/auth.module';

import { GRPC_CONFIG } from '../config/grpc.constants';

@Module({
  imports: [
    AuthModule,
  ],
  controllers: [ExperiencesController],
  providers: [ExperiencesService],
})
export class ExperiencesModule {}
