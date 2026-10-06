import { z } from 'zod';

export const leadSourceSchema = z.object({
  name: z.string().min(2, 'Source name must be at least 2 characters'),
  isActive: z.boolean(),
});

export type LeadSourceFormData = z.infer<typeof leadSourceSchema>;
