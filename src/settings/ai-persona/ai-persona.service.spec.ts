import { Test, TestingModule } from '@nestjs/testing';
import { AiPersonaService } from './ai-persona.service';

describe('AiPersonaService', () => {
  let service: AiPersonaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiPersonaService],
    }).compile();

    service = module.get<AiPersonaService>(AiPersonaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
