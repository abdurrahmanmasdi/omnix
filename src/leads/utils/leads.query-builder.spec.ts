import { BadRequestException } from '@nestjs/common';
import { LeadStatus, Priority } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { LeadsQueryBuilder } from './leads.query-builder';

describe('LeadsQueryBuilder', () => {
  let builder: LeadsQueryBuilder;

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  } as unknown as I18nService;

  beforeEach(() => {
    jest.clearAllMocks();
    builder = new LeadsQueryBuilder(mockI18nService);
  });

  describe('buildOrderBy', () => {
    it('returns created_at desc when sort values are missing', () => {
      expect(builder.buildOrderBy()).toEqual({ created_at: 'desc' });
    });

    it('uses normalized allowed sort field and asc direction', () => {
      expect(builder.buildOrderBy(' FIRST_NAME ', ' ASC ')).toEqual({
        first_name: 'asc',
      });
    });

    it('falls back to created_at when sort field is not allowed', () => {
      expect(builder.buildOrderBy('unsupported_field', 'asc')).toEqual({
        created_at: 'asc',
      });
    });

    it('falls back to desc when sort direction is invalid', () => {
      expect(builder.buildOrderBy('status', 'up')).toEqual({
        status: 'desc',
      });
    });
  });

  describe('parseDynamicFilterRules', () => {
    it('returns empty array when no filters are passed', () => {
      expect(builder.parseDynamicFilterRules()).toEqual([]);
      expect(builder.parseDynamicFilterRules('')).toEqual([]);
    });

    it('throws BadRequestException for invalid JSON', () => {
      expect(() => builder.parseDynamicFilterRules('{invalid-json')).toThrow(
        BadRequestException,
      );
      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.INVALID_FILTERS',
      );
    });

    it('throws BadRequestException for non-array JSON payloads', () => {
      expect(() =>
        builder.parseDynamicFilterRules('{"field":"status"}'),
      ).toThrow(BadRequestException);
      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.INVALID_FILTERS',
      );
    });

    it('filters out malformed rules and returns only valid dynamic rules', () => {
      const parsed = builder.parseDynamicFilterRules(
        JSON.stringify([
          null,
          'invalid',
          {
            field: 'status',
            operator: 'equals',
            value: LeadStatus.OPEN,
          },
          {
            field: 'priority',
            operator: 'in',
            value: [Priority.HOT, Priority.WARM],
          },
          {
            field: 'status',
            value: LeadStatus.WON,
          },
        ]),
      );

      expect(parsed).toEqual([
        {
          field: 'status',
          operator: 'equals',
          value: LeadStatus.OPEN,
        },
        {
          field: 'priority',
          operator: 'in',
          value: [Priority.HOT, Priority.WARM],
        },
      ]);
    });
  });

  describe('buildDynamicFilterCondition', () => {
    it('returns null for non-allowed fields', () => {
      expect(
        builder.buildDynamicFilterCondition({
          field: 'unknown_field',
          operator: 'equals',
          value: 'x',
        }),
      ).toBeNull();
    });

    it('builds equals condition for valid status', () => {
      expect(
        builder.buildDynamicFilterCondition({
          field: 'status',
          operator: 'equals',
          value: LeadStatus.OPEN,
        }),
      ).toEqual({ status: LeadStatus.OPEN });
    });

    it('throws for invalid status in equals condition', () => {
      expect(() =>
        builder.buildDynamicFilterCondition({
          field: 'status',
          operator: 'equals',
          value: 'CONTACTED',
        }),
      ).toThrow(BadRequestException);
    });

    it('builds equals condition for valid priority', () => {
      expect(
        builder.buildDynamicFilterCondition({
          field: 'priority',
          operator: 'equals',
          value: Priority.COLD,
        }),
      ).toEqual({ priority: Priority.COLD });
    });

    it('throws for invalid priority in equals condition', () => {
      expect(() =>
        builder.buildDynamicFilterCondition({
          field: 'priority',
          operator: 'equals',
          value: 'URGENT',
        }),
      ).toThrow(BadRequestException);
    });

    it('normalizes and validates UUID fields in equals condition', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';

      expect(
        builder.buildDynamicFilterCondition({
          field: 'source_id',
          operator: 'equals',
          value: ` ${validUuid} `,
        }),
      ).toEqual({ source_id: validUuid });
    });

    it('throws for invalid UUID formats in UUID-only fields', () => {
      expect(() =>
        builder.buildDynamicFilterCondition({
          field: 'pipeline_stage_id',
          operator: 'equals',
          value: 'not-a-uuid',
        }),
      ).toThrow(BadRequestException);
    });

    it('throws for non-string values in string-backed fields', () => {
      expect(() =>
        builder.buildDynamicFilterCondition({
          field: 'country',
          operator: 'equals',
          value: 123,
        }),
      ).toThrow(BadRequestException);
    });

    it('throws for blank string values in string-backed fields', () => {
      expect(() =>
        builder.buildDynamicFilterCondition({
          field: 'country',
          operator: 'equals',
          value: '   ',
        }),
      ).toThrow(BadRequestException);
    });

    it('builds in condition for valid list values', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';

      expect(
        builder.buildDynamicFilterCondition({
          field: 'assigned_agent_id',
          operator: 'in',
          value: [validUuid, ` ${validUuid} `],
        }),
      ).toEqual({
        assigned_agent_id: { in: [validUuid, validUuid] },
      });
    });

    it('throws when in operator receives non-array value', () => {
      expect(() =>
        builder.buildDynamicFilterCondition({
          field: 'status',
          operator: 'in',
          value: LeadStatus.OPEN,
        }),
      ).toThrow(BadRequestException);
    });

    it('throws when in operator contains invalid member values', () => {
      expect(() =>
        builder.buildDynamicFilterCondition({
          field: 'priority',
          operator: 'in',
          value: [Priority.HOT, 'INVALID_PRIORITY'],
        }),
      ).toThrow(BadRequestException);
    });

    it('returns null for unsupported operators on allowed fields', () => {
      expect(
        builder.buildDynamicFilterCondition({
          field: 'status',
          operator: 'contains',
          value: 'OPEN',
        }),
      ).toBeNull();
    });
  });
});
