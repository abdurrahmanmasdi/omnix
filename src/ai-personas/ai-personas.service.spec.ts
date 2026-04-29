import { Test, TestingModule } from '@nestjs/testing';
import { AiPersonasService } from './ai-personas.service';

describe('AiPersonasService', () => {
  let service: AiPersonasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiPersonasService],
    }).compile();

    service = module.get<AiPersonasService>(AiPersonasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
