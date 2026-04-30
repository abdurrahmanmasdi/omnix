import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KnowledgeController } from './presentation/knowledge.controller';
import { UploadKnowledgeUseCase } from './application/use-cases/upload-knowledge.use-case';
import { PythonKnowledgeEngineAdapter } from './infrastructure/adapters/python-knowledge-engine.adapter';
import { KNOWLEDGE_ENGINE_PORT } from './application/ports/knowledge-engine.port';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [HttpModule, PrismaModule],
  controllers: [KnowledgeController],
  providers: [
    UploadKnowledgeUseCase,
    {
      provide: KNOWLEDGE_ENGINE_PORT,
      useClass: PythonKnowledgeEngineAdapter,
    },
  ],
})
export class KnowledgeModule {}
