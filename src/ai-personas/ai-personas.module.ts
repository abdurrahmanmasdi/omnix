import { Module } from '@nestjs/common';
import { AiPersonasService } from './ai-personas.service';
import { AiPersonasController } from './ai-personas.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AiPersonasController],
  providers: [AiPersonasService, PrismaService],
})
export class AiPersonasModule {}
