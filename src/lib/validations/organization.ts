import * as z from 'zod';

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens allowed'),
  industry_category: z.string().optional(),
});

export type CreateOrganizationFormData = z.infer<typeof createOrganizationSchema>;