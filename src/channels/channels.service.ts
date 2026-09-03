import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { WhatsappService } from '../webhooks/whatsapp.service';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  async createChannel(organizationId: string, dto: CreateChannelDto) {
    // Verify credentials with Meta API before saving
    if (dto.provider === 'WHATSAPP_CLOUD_API') {
      const isValid = await this.whatsappService.verifyCredentials(
        dto.accessToken,
        dto.providerAccountId,
      );

      if (!isValid) {
        throw new BadRequestException(
          'Invalid WhatsApp credentials. The Meta Graph API rejected the token or Phone Number ID.',
        );
      }
    }

    try {
      return await this.prisma.channel.create({
        data: {
          organizationId,
          provider: dto.provider,
          providerAccountId: dto.providerAccountId,
          accessToken: dto.accessToken,
          status: 'ACTIVE',
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'This channel is already connected to an organization.',
        );
      }
      throw error;
    }
  }

  async getChannels(organizationId: string) {
    return this.prisma.channel.findMany({
      where: { organizationId },
    });
  }

  async deleteChannel(organizationId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id, organizationId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return this.prisma.channel.delete({
      where: { id },
    });
  }
}
