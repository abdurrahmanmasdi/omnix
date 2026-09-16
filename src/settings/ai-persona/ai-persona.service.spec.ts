import { Test, TestingModule } from '@nestjs/testing';
import { AiPersonaService } from './ai-persona.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AiPersonaService', () => {
  let provider: AiPersonaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiPersonaService,
        { provide: PrismaService, useValue: { methodName: jest.fn() } }
      ],
      controllers: []
    }).compile();

    provider = module.get<AiPersonaService>(AiPersonaService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
