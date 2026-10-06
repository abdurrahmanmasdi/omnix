import { z } from 'zod';

export const pipelineStageSchema = z.object({
  name: z.string().min(2, 'Stage name must be at least 2 characters'),
  mappedStatus: z.string().optional().transform(v => (v === "" || v === "UNMAPPED") ? undefined : v),
});

export type PipelineStageFormData = z.infer<typeof pipelineStageSchema>;
