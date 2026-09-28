import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMediaService } from './whatsapp-media.service';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

jest.mock('axios');

describe('WhatsappMediaService', () => {
  let service: WhatsappMediaService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappMediaService,
        {
          provide: PrismaService,
          useValue: {
            auditLog: { create: jest.fn() },
            message: {
              updateMany: jest.fn().mockResolvedValue({ count: 5 }),
              findMany: jest.fn().mockResolvedValue([{ id: 'msg-1', metaMessageId: 'meta-1', conversation: { organizationId: 'org-1' } }]),
              update: jest.fn().mockResolvedValue({}),
            },
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappMediaService>(WhatsappMediaService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('downloadMediaAsBase64', () => {
    it('should download and convert media to base64', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: { url: 'http://example.com/media' },
      });
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: Buffer.from('test-data'),
      });

      const result = await service.downloadMediaAsBase64('media-id', 'token');
      expect(result).toBe(Buffer.from('test-data').toString('base64'));
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it('should return null if url is not found', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: {} });
      const result = await service.downloadMediaAsBase64('media-id', 'token');
      expect(result).toBeNull();
    });
  });

  describe('cleanupExpiredMedia', () => {
    it('should delete mediaUrls for expired media', async () => {
      await service.cleanupExpiredMedia();
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: {
          mediaExpiresAt: { lte: expect.any(Date) },
          mediaUrl: { not: null },
        },
        include: { conversation: true },
      });
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: {
          mediaUrl: null,
          content: '[Patient Media - Expired and Deleted]',
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });
});
