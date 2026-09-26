import 'dotenv/config';
import { closeSync, fsyncSync, openSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationsService } from './invitations.service';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      operator: { type: 'string' },
      output: { type: 'string' },
      origin: { type: 'string' },
      revoke: { type: 'string' },
    },
  });
  if (
    !values.operator ||
    (!values.revoke && (!values.email || !values.output || !values.origin))
  ) {
    throw new Error(
      'Provide --operator and either --revoke <id> or --email, --origin, --output',
    );
  }
  const prisma = new PrismaService();
  try {
    const invitations = new InvitationsService(prisma);
    if (values.revoke) {
      await invitations.revoke(values.revoke, values.operator);
      console.log('INVITATION_REVOCATION_COMPLETE');
      return;
    }
    const origin = new URL(values.origin!);
    if (
      (origin.protocol !== 'https:' &&
        !(
          origin.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(origin.hostname)
        )) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      throw new Error('Invalid frontend origin');
    }
    const output = openSync(values.output!, 'wx', 0o600);
    let invitationId: string | undefined;
    try {
      const invitation = await invitations.issue(
        values.email!,
        values.operator,
      );
      invitationId = invitation.invitationId;
      const url = new URL('/accept-invitation', origin);
      url.hash = new URLSearchParams({ token: invitation.token }).toString();
      writeFileSync(output, `${url.toString()}\n`, 'utf8');
      fsyncSync(output);
      console.log(
        `INVITATION_CREATED id=${invitation.invitationId} expiresAt=${invitation.expiresAt.toISOString()}`,
      );
    } catch (error) {
      if (invitationId) await invitations.revoke(invitationId, values.operator);
      throw error;
    } finally {
      closeSync(output);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error('INVITATION_OPERATION_FAILED: see docs/PILOT_ACTIVATION.md');
    process.exitCode = 1;
  });
}
