import * as z from 'zod';

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens allowed'),
  agentTone: z.string().min(1, 'Please select an agent tone'),
  businessRules: z.array(z.object({ rule: z.string().min(1, "Rule cannot be empty") })).default([{ rule: "" }]),
  industry_category: z.string().optional(),
});

export type CreateOrganizationFormData = z.infer<typeof createOrganizationSchema>;