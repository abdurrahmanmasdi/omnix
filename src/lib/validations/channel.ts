import { z } from 'zod';

export const createChannelSchema = z.object({
  provider: z.enum(['WHATSAPP', 'MESSENGER', 'INSTAGRAM']).default('WHATSAPP'),
  providerAccountId: z.string().min(1, 'Phone Number ID is required'),
  accessToken: z.string().min(1, 'Access Token is required'),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
