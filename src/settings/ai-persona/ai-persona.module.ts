import { Module } from '@nestjs/common';
import { AiPersonaService } from './ai-persona.service';
import { AiPersonaController } from './ai-persona.controller';

@Module({
  providers: [AiPersonaService],
  controllers: [AiPersonaController]
})
export class AiPersonaModule {}
