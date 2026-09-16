import { Test, TestingModule } from '@nestjs/testing';
import { AiPersonaController } from './ai-persona.controller';
import { AiPersonaService } from './ai-persona.service';

describe('AiPersonaController', () => {
  let provider: AiPersonaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiPersonaController,
        { provide: AiPersonaService, useValue: { methodName: jest.fn() } }
      ],
      controllers: [AiPersonaController]
    }).compile();

    provider = module.get<AiPersonaController>(AiPersonaController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
