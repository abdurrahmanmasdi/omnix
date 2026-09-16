import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let provider: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppController,
        { provide: AppService, useValue: { methodName: jest.fn() } }
      ],
      controllers: [AppController]
    }).compile();

    provider = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
