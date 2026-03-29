import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  BulkUpdateLeadDataDto,
  BulkUpdateLeadsDto,
} from './bulk-update-leads.dto';

describe('BulkUpdateLeadsDto', () => {
  it('transforms update_data into BulkUpdateLeadDataDto instance', () => {
    const dto = plainToInstance(BulkUpdateLeadsDto, {
      lead_ids: ['11111111-1111-4111-8111-111111111111'],
      update_data: {
        status: 'WON',
      },
    });

    expect(dto).toBeInstanceOf(BulkUpdateLeadsDto);
    expect(dto.update_data).toBeInstanceOf(BulkUpdateLeadDataDto);
    expect(dto.update_data.status).toBe('WON');
  });
});
