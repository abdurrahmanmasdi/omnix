import { Test, TestingModule } from '@nestjs/testing';
import { AiPersonasController } from './ai-personas.controller';
import { AiPersonasService } from './ai-personas.service';

describe('AiPersonasController', () => {
  let controller: AiPersonasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiPersonasController],
      providers: [AiPersonasService],
    }).compile();

    controller = module.get<AiPersonasController>(AiPersonasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
