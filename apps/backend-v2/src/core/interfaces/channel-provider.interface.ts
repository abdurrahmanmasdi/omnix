import { IIntegrationProvider } from './integration-provider.interface';

export interface IChannelProvider extends IIntegrationProvider {
  /**
   * Sends a text message to the specified recipient.
   */
  sendTextMessage(
    credentialId: string,
    organizationId: string,
    to: string,
    message: string,
    providerAccountId?: string,
  ): Promise<any>;

  /**
   * Sends a media message (image, document, etc.) to the specified recipient.
   */
  sendMediaMessage(
    credentialId: string,
    organizationId: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    providerAccountId?: string,
  ): Promise<any>;
}
