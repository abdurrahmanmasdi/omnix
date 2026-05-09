import { z } from 'zod';
import { CreateLeadDtoStatus } from '../api/model/createLeadDtoStatus';
import { CreateLeadDtoPriority } from '../api/model/createLeadDtoPriority';
import { CreateLeadDtoCurrency } from '../api/model/createLeadDtoCurrency';

export const leadSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().min(5, 'Valid phone number is required'),
  country: z.string().min(1, 'Country is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  status: z.nativeEnum(CreateLeadDtoStatus),
  priority: z.nativeEnum(CreateLeadDtoPriority),
  currency: z.nativeEnum(CreateLeadDtoCurrency).default(CreateLeadDtoCurrency.USD),
  estimatedValue: z.number().min(0).default(0),
  timezone: z.string().default('UTC'),
  primaryLanguage: z.string().default('en'),
  expectedServiceDate: z.string().optional().or(z.literal('')),
  sourceId: z.string().optional().or(z.literal('')).or(z.literal('none')),
  socialLinks: z.object({
    instagram: z.string().url('Invalid Instagram URL').optional().or(z.literal('')),
    tiktok: z.string().url('Invalid TikTok URL').optional().or(z.literal('')),
    facebook: z.string().url('Invalid Facebook URL').optional().or(z.literal('')),
    twitter: z.string().url('Invalid Twitter URL').optional().or(z.literal('')),
  }).optional(),
});

export type LeadFormData = z.infer<typeof leadSchema>;
