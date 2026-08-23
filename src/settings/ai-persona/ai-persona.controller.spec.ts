import { Test, TestingModule } from '@nestjs/testing';
import { AiPersonaController } from './ai-persona.controller';

describe('AiPersonaController', () => {
  let controller: AiPersonaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiPersonaController],
    }).compile();

    controller = module.get<AiPersonaController>(AiPersonaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
