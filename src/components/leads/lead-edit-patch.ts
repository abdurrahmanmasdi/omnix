import type { UpdateLeadDto } from '@/lib/api/model';
import { isMasked } from '@/features/inbox/model';

export function dirtyLeadPatch(payload: UpdateLeadDto, dirty: Record<string, unknown>, original?: Record<string, unknown>): UpdateLeadDto {
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => {
    if (!dirty[key]) return false;
    if (key === 'phoneNumber' || key === 'email') {
      const before = original?.[key];
      if (typeof before === 'string' && isMasked(before)) return false;
      if (typeof value === 'string' && isMasked(value)) return false;
    }
    return true;
  })) as UpdateLeadDto;
}
