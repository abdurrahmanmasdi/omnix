import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ClinicFactsController } from './clinic-facts.controller';
import { ClinicFactsService } from './clinic-facts.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClinicFactsDto } from './dto/clinic-facts.dto';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const OWNER = '00000000-0000-4000-8000-000000000003';
const facts: ClinicFactsDto = {
  treatments: [
    {
      name: 'Synthetic crown',
      priceMin: 220,
      priceMax: 320,
      currency: 'EUR',
      unit: 'tooth',
      included: 'Consultation',
    },
  ],
  doctors: [{ name: 'Synthetic doctor', role: 'Dentist', years: 10 }],
  warranty: 'Two years',
  process: 'Consultation first',
  days: '5–7',
  location: 'Synthetic clinic',
  paymentMethods: ['Card'],
  languages: ['en'],
  offers: [
    {
      text: 'Synthetic offer',
      enabled: true,
      validFrom: '2026-01-01T00:00:00Z',
      validTo: '2027-01-01T00:00:00Z',
    },
  ],
};
type Row = {
  id: string;
  organizationId: string;
  version: number;
  facts: ClinicFactsDto;
  approvedAt: Date | null;
  approvedBy: string | null;
};

describe('Clinic facts API', () => {
  let app: INestApplication;
  let rows: Row[];
  let audit: jest.Mock;
  let has: jest.Mock;
  let repo: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  beforeEach(async () => {
    rows = [];
    audit = jest.fn().mockResolvedValue({});
    has = jest.fn(
      async (user, org, permission) =>
        user === OWNER &&
        [A, B].includes(org) &&
        permission === 'organization:manage',
    );
    repo = {
      findFirst: jest.fn(
        async ({ where }) =>
          rows
            .filter(
              (r) =>
                r.organizationId === where.organizationId &&
                (!where.approvedAt || r.approvedAt),
            )
            .sort((a, b) => b.version - a.version)[0] ?? null,
      ),
      create: jest.fn(async ({ data }) => {
        const row = {
          ...data,
          id: `revision-${rows.length}`,
          approvedAt: null,
          approvedBy: null,
        };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = rows.find(
          (r) => r.id === where.id && r.organizationId === where.organizationId,
        )!;
        Object.assign(row, data);
        return row;
      }),
    };
    const tx = {
      clinicFactSheet: repo,
      organization: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: audit },
    };
    const module = await Test.createTestingModule({
      controllers: [ClinicFactsController],
      providers: [
        ClinicFactsService,
        { provide: PrismaService, useValue: { $transaction: (fn) => fn(tx) } },
        { provide: PermissionService, useValue: { has } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            id: req.headers['x-staff'] ?? OWNER,
            organizationId: req.headers['x-clinic'] ?? A,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });
  afterEach(async () => {
    await app.close();
  });
  const endpoint = '/organizations/current/clinic-facts';
  const save = (version = 0, clinic = A, data = facts) =>
    request(app.getHttpServer())
      .put(endpoint)
      .set('x-clinic', clinic)
      .send({ expectedVersion: version, facts: data });
  const approve = (version = 1, clinic = A) =>
    request(app.getHttpServer())
      .post(endpoint + '/approve')
      .set('x-clinic', clinic)
      .send({ version });

  it('requires organization:manage for read, save and approval', async () => {
    for (const method of ['get', 'put', 'post'] as const) {
      const response = await request(app.getHttpServer())
        [method](method === 'post' ? endpoint + '/approve' : endpoint)
        .set('x-staff', 'synthetic-staff')
        .send(
          method === 'post' ? { version: 1 } : { expectedVersion: 0, facts },
        );
      expect(response.status).toBe(403);
    }
    expect(rows).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });
  it('saves a draft then approves that exact revision with actor and audit', async () => {
    expect((await save()).status).toBe(200);
    const draft = await request(app.getHttpServer()).get(endpoint);
    expect(draft.body.latest.version).toBe(1);
    expect(draft.body.approved).toBeNull();
    const approved = await approve();
    expect(approved.status).toBe(200);
    expect(approved.body.approvedBy).toBe(OWNER);
    expect(approved.body.approvedAt).toBeTruthy();
    expect(
      (await request(app.getHttpServer()).get(endpoint)).body.approved.facts,
    ).toEqual(facts);
    expect(audit.mock.calls.map(([q]) => q.data.action)).toEqual([
      'clinic_facts.draft_saved',
      'clinic_facts.read',
      'clinic_facts.approved',
      'clinic_facts.read',
    ]);
    expect(
      audit.mock.calls.every(
        ([q]) => q.data.organizationId === A && q.data.actor === OWNER,
      ),
    ).toBe(true);
  });
  it('keeps approved facts while a new draft is saved, and rejects stale approval/save', async () => {
    await save();
    await approve();
    await save(1, A, { ...facts, warranty: 'New draft warranty' });
    const sheet = (await request(app.getHttpServer()).get(endpoint)).body;
    expect(sheet.latest.version).toBe(2);
    expect(sheet.approved.version).toBe(1);
    expect(sheet.approved.facts.warranty).toBe('Two years');
    expect((await save(1)).status).toBe(409);
    expect((await approve(1)).status).toBe(409);
    expect((await approve(2)).status).toBe(200);
    expect((await approve(2)).status).toBe(200);
    expect(
      audit.mock.calls.filter(
        ([q]) => q.data.action === 'clinic_facts.approved',
      ),
    ).toHaveLength(2);
  });
  it('does not read, update or approve the other tenant revision', async () => {
    await save();
    await approve();
    expect(
      (await request(app.getHttpServer()).get(endpoint).set('x-clinic', B))
        .body,
    ).toEqual({ latest: null, approved: null });
    expect((await approve(1, B)).status).toBe(404);
    await save(0, B, { ...facts, location: 'Other synthetic clinic' });
    await approve(1, B);
    expect(
      (await request(app.getHttpServer()).get(endpoint)).body.approved.facts
        .location,
    ).toBe('Synthetic clinic');
    expect(
      repo.update.mock.calls.every(([q]) =>
        rows.some(
          (r) =>
            r.id === q.where.id && r.organizationId === q.where.organizationId,
        ),
      ),
    ).toBe(true);
  });
  it('rejects invalid ranges, missing facts and tenant/approval injection', async () => {
    expect(
      (
        await save(0, A, {
          ...facts,
          treatments: [{ ...facts.treatments[0], priceMin: 999 }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await save(0, A, {
          ...facts,
          offers: [{ ...facts.offers[0], validFrom: '2028-01-01T00:00:00Z' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .put(endpoint)
          .send({ expectedVersion: 0 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer()).put(endpoint).send({
          expectedVersion: 0,
          facts,
          organizationId: B,
          approvedBy: OWNER,
        })
      ).status,
    ).toBe(400);
  });
});
