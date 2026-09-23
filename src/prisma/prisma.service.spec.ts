import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let provider: PrismaService;

  beforeEach(async () => {
    process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake';
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
      controllers: [],
    }).compile();

    provider = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
