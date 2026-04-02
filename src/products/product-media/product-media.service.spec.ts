import { Test, TestingModule } from '@nestjs/testing';
import { ProductMediaService } from './product-media.service';

describe('ProductMediaService', () => {
  let service: ProductMediaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductMediaService],
    }).compile();

    service = module.get<ProductMediaService>(ProductMediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
