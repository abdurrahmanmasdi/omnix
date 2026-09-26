import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class WhatsappMediaService {
  private readonly logger = new Logger(WhatsappMediaService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredMedia() {
    this.logger.log('Running cleanup for expired patient media...');
    try {
      const result = await this.prisma.message.updateMany({
        where: {
          mediaExpiresAt: { lte: new Date() },
          mediaUrl: { not: null },
        },
        data: {
          mediaUrl: null,
          content: '[Patient Media - Expired and Deleted]',
        },
      });
      if (result.count > 0) {
        this.logger.log(
          `Successfully deleted media for ${result.count} expired messages.`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to cleanup expired media', error);
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
        this.logger.error(
          `No media URL found in response for mediaId: ${mediaId}`,
        );
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
    } catch (error: any) {
      this.logger.error(
        `Failed to download media (ID: ${mediaId}): ${error.response?.data?.error?.message || error.message}`,
      );
      return null; // Return null gracefully on failure
    }
  }
}
