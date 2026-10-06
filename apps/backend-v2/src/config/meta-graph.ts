import { ConfigService } from '@nestjs/config';

export const DEFAULT_META_GRAPH_VERSION = 'v26.0';
export const metaGraphVersion = (config?: ConfigService): string =>
  config?.get<string>('META_GRAPH_API_VERSION') ?? DEFAULT_META_GRAPH_VERSION;
export const metaGraphUrl = (config?: ConfigService): string =>
  `https://graph.facebook.com/${metaGraphVersion(config)}`;
