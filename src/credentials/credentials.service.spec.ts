import { ConfigService } from '@nestjs/config';
import { CredentialStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from './credentials.service';

type Row = { id: string; organizationId: string; status: CredentialStatus };
type Where = {
  id: string;
  organizationId: string;
  status?: CredentialStatus | { in: CredentialStatus[] };
};
type UpdateArgs = { where: Where; data: { status?: CredentialStatus } };

/** Minimal in-memory credential table honouring the `status` filter of updateMany/update. */
const fakePrisma = (rows: Row[]) => {
  const matches = (row: Row, where: Where) =>
    row.id === where.id &&
    (where.organizationId === undefined ||
      row.organizationId === where.organizationId) &&
    (where.status === undefined ||
      (typeof where.status === 'string'
        ? row.status === where.status
        : where.status.in.includes(row.status)));
  const apply = (where: Where, data: { status?: CredentialStatus }) => {
    const hit = rows.filter((row) => matches(row, where));
    hit.forEach((row) => data.status && (row.status = data.status));
    return { count: hit.length };
  };
  return {
    credential: {
      updateMany: jest.fn(({ where, data }: UpdateArgs) =>
        Promise.resolve(apply(where, data)),
      ),
      update: jest.fn(({ where, data }: UpdateArgs) =>
        Promise.resolve(apply(where, data)),
      ),
      findFirst: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
      ),
    },
  } as unknown as PrismaService;
};

describe('CredentialsService status transitions', () => {
  const audit = { record: jest.fn() } as unknown as AuditService;
  const config = { get: jest.fn() } as unknown as ConfigService;

  it.each([CredentialStatus.REVOKED, CredentialStatus.ROTATED])(
    'verification never revives or errors a %s credential',
    async (status) => {
      const rows: Row[] = [{ id: 'c1', organizationId: 'o1', status }];
      const service = new CredentialsService(fakePrisma(rows), config, audit);
      await service.recordVerification('o1', 'c1', true);
      expect(rows[0].status).toBe(status);
      await service.recordVerification('o1', 'c1', false, 'bad token');
      expect(rows[0].status).toBe(status);
    },
  );

  it('verification moves ACTIVE ⇄ ERROR', async () => {
    const rows: Row[] = [
      { id: 'c1', organizationId: 'o1', status: CredentialStatus.ACTIVE },
    ];
    const service = new CredentialsService(fakePrisma(rows), config, audit);
    await service.recordVerification('o1', 'c1', false, 'bad token');
    expect(rows[0].status).toBe(CredentialStatus.ERROR);
    await service.recordVerification('o1', 'c1', true);
    expect(rows[0].status).toBe(CredentialStatus.ACTIVE);
  });

  it.each([CredentialStatus.REVOKED, CredentialStatus.ROTATED])(
    'operator CLEAR_ERROR does not revive a %s credential',
    async (status) => {
      const rows: Row[] = [{ id: 'c1', organizationId: 'o1', status }];
      const service = new CredentialsService(fakePrisma(rows), config, audit);
      await expect(
        service.operatorRecovery('o1', 'c1', 'CLEAR_ERROR'),
      ).rejects.toMatchObject({
        status: 409,
      });
      expect(rows[0].status).toBe(status);
    },
  );
});
