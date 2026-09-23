import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { WhatsappService } from '../webhooks/whatsapp.service';
import { InstagramService } from '../webhooks/instagram.service';
import { CredentialsService } from '../credentials/credentials.service';
import { HubspotAdapter } from '../modules/integration/crm/adapters/hubspot.adapter';
import { CredentialProvider } from '@prisma/client';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly instagramService: InstagramService,
    private readonly credentials: CredentialsService,
    private readonly hubspotAdapter: HubspotAdapter,
  ) {}

  async createChannel(organizationId: string, dto: CreateChannelDto) {
    try {
      // Create credential first (status defaults to ACTIVE)
      const credential = await this.credentials.create(
        organizationId,
        dto.provider,
        {
          accessToken: dto.accessToken,
          ...(dto.provider === 'WHATSAPP_CLOUD_API'
            ? { phoneNumberId: dto.providerAccountId }
            : {}),
          ...(dto.provider === 'INSTAGRAM_GRAPH_API'
            ? { instagramAccountId: dto.providerAccountId }
            : {}),
        },
      );

      // Verify credentials with Provider API before creating channel
      let isValid = false;
      if (dto.provider === 'WHATSAPP_CLOUD_API') {
        isValid = await this.whatsappService.verifyCredentials(
          credential.id,
          organizationId,
        );
      } else if (dto.provider === 'INSTAGRAM_GRAPH_API') {
        isValid = await this.instagramService.verifyCredentials(
          credential.id,
          organizationId,
        );
      } else if (dto.provider === 'HUBSPOT') {
        isValid = await this.hubspotAdapter.verifyCredentials(
          credential.id,
          organizationId,
        );
      } else {
        // Unknown provider, assume valid or reject. Rejecting to be safe.
        throw new BadRequestException('Unsupported channel provider');
      }

      if (!isValid) {
        // Clean up invalid credential
        await this.credentials.revoke(
          organizationId,
          credential.id,
          'Initial verification failed',
        );
        throw new BadRequestException(
          `Invalid ${dto.provider} credentials. The API rejected the token or Account ID.`,
        );
      }

      return await this.prisma.channel.create({
        data: {
          organizationId,
          provider: dto.provider,
          providerAccountId: dto.providerAccountId,
          credentialId: credential.id,
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
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        status: true,
        credentialId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteChannel(organizationId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id, organizationId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.credentialId) {
      if (channel.provider === 'WHATSAPP_CLOUD_API') {
        await this.whatsappService.disconnect(
          channel.credentialId,
          organizationId,
        );
      } else if (channel.provider === 'INSTAGRAM_GRAPH_API') {
        await this.instagramService.disconnect(
          channel.credentialId,
          organizationId,
        );
      } else if (channel.provider === 'HUBSPOT') {
        await this.hubspotAdapter.disconnect(
          channel.credentialId,
          organizationId,
        );
      } else {
        await this.credentials.revoke(
          organizationId,
          channel.credentialId,
          'Channel disconnected by operator',
        );
      }
    }

    return this.prisma.channel.update({
      where: { id },
      data: { status: 'DISCONNECTED' },
    });
  }
}
