import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { WeeklyReportService } from './weekly-report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionService } from '../auth/permission.service';
import { WEEKLY_PERMISSIONS } from './dto/weekly-report.dto';
import { ROLE_PERMISSIONS } from '../auth/permissions.catalog';
describe('weekly report HTTP permissions', () => {
  let app: INestApplication;
  let missing: string | null;
  let tenant: string | null;
  const getReport = jest.fn(async () => ({ version: 1 }));
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: { getSummary: jest.fn(async () => ({ totalLeads: 7 })) },
        },
        { provide: WeeklyReportService, useValue: { getReport } },
        {
          provide: PermissionService,
          useValue: {
            has: jest.fn(
              async (_user: string, _org: string, grant: string) =>
                grant !== missing,
            ),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = {
            id: 'synthetic-user',
            organizationId: tenant,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    missing = null;
    tenant = 'clinic-a';
    getReport.mockClear();
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each(WEEKLY_PERMISSIONS)(
    'denies direct HTTP and access probe without %s',
    async (grant) => {
      missing = grant;
      await request(app.getHttpServer())
        .get('/analytics/weekly-report')
        .expect(403);
      await request(app.getHttpServer())
        .get('/analytics/weekly-report/access')
        .expect(403);
      expect(getReport).not.toHaveBeenCalled();
    },
  );
  it('denies missing organization before queries', async () => {
    tenant = null;
    await request(app.getHttpServer())
      .get('/analytics/weekly-report')
      .expect(403);
    expect(getReport).not.toHaveBeenCalled();
  });
  it('sets no-store and resolves only authenticated tenant', async () => {
    await request(app.getHttpServer())
      .get('/analytics/weekly-report?weekStart=2026-10-05')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(getReport).toHaveBeenCalledWith('clinic-a', {
      weekStart: '2026-10-05',
    });
    await request(app.getHttpServer())
      .get('/analytics/weekly-report/access')
      .expect(200, { allowed: true });
  });
  it.each([
    'organizationId=foreign',
    'weekStart=2026-10-05&weekStart=2026-10-12',
    'weekStart[]=2026-10-05',
    'weekStart=invalid',
  ])('rejects malformed or extra query %s', async (query) => {
    await request(app.getHttpServer())
      .get('/analytics/weekly-report?' + query)
      .expect(400);
    expect(getReport).not.toHaveBeenCalled();
  });
  it('preserves summary behavior', async () => {
    await request(app.getHttpServer())
      .get('/analytics/summary')
      .expect(200, { totalLeads: 7 });
  });
  it('verifies owner/admin defaults without broadening roles', () => {
    for (const role of ['Super Admin', 'Manager'] as const)
      for (const grant of WEEKLY_PERMISSIONS)
        expect(ROLE_PERMISSIONS[role]).toContain(grant);
  });
});
