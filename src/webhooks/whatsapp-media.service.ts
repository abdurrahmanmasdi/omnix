import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import axios from 'axios';

@Injectable()
export class WhatsappMediaService implements OnModuleInit {
  async onModuleInit() {
    await this.cleanupExpiredMedia();
  }
  private readonly logger = new Logger(WhatsappMediaService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredMedia() {
    this.logger.log('Running cleanup for expired patient media...');
    try {
      await tenantStorage.run({ isSystemBypass: true }, async () => {
        const messages = await this.prisma.message.findMany({
          where: {
            mediaExpiresAt: { lte: new Date() },
            mediaUrl: { not: null },
          },
          include: { conversation: true },
        });

        if (messages.length === 0) return;

        for (const message of messages) {
           await this.prisma.message.update({
             where: { id: message.id },
             data: {
               mediaUrl: null,
               content: '[Patient Media - Expired and Deleted]',
             }
           });
           await this.prisma.auditLog.create({
             data: {
               organizationId: message.conversation.organizationId,
               actor: 'system',
               action: 'media.expired_deleted',
               targetId: message.id,
               metadata: { deletedMessageId: message.id },
             }
           });
        }
        this.logger.log(
          `Successfully deleted media for ${messages.length} expired messages.`,
        );
      });
    } catch {
      this.logger.error('MEDIA_CLEANUP_FAILED');
    }
  }

  /**
   * Downloads media from WhatsApp Graph API and converts it to a Base64 string.
   *
   * @param mediaId The media ID received from the WhatsApp webhook
   * @param accessToken The organization's WhatsApp access token
   * @returns Base64 string of the media, or null if download fails
   */
  async downloadMediaAsBase64(
    mediaId: string,
    accessToken: string,
  ): Promise<string | null> {
    try {
      // Step 1: Get the media URL from the Graph API using the media ID
      const metadataResponse = await axios.get(
        `https://graph.facebook.com/v19.0/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const mediaUrl = metadataResponse.data?.url;

      if (!mediaUrl) {
        this.logger.error('MEDIA_URL_MISSING');
        return null;
      }

      // Step 2: Download the actual media binary data
      const mediaResponse = await axios.get(mediaUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        responseType: 'arraybuffer',
      });

      // Step 3: Convert the binary data buffer to a Base64 string
      const base64Media = Buffer.from(mediaResponse.data).toString('base64');
      return base64Media;
    } catch {
      this.logger.error('MEDIA_DOWNLOAD_FAILED');
      return null; // Return null gracefully on failure
    }
  }
}
