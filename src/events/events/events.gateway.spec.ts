import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('EventsGateway', () => {
  let provider: EventsGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: JwtService, useValue: { methodName: jest.fn() } },
        { provide: ConfigService, useValue: { methodName: jest.fn() } }
      ],
      controllers: []
    }).compile();

    provider = module.get<EventsGateway>(EventsGateway);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
