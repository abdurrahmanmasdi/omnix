import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  Currency,
  LeadStatus,
  MembershipStatus,
  Prisma,
  PrismaClient,
  Priority,
} from '@prisma/client';
import { faker } from '@faker-js/faker';

const TOTAL_LEADS = 50_000;
const BATCH_SIZE = 5_000;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const leadStatuses: readonly LeadStatus[] = [
  LeadStatus.OPEN,
  LeadStatus.WON,
  LeadStatus.LOST,
  LeadStatus.UNQUALIFIED,
];

const priorities: readonly Priority[] = [
  Priority.HOT,
  Priority.WARM,
  Priority.COLD,
];

const locales = [
  {
    country: 'US',
    timezone: 'America/New_York',
    language: 'en',
    currency: Currency.USD,
  },
  {
    country: 'TR',
    timezone: 'Europe/Istanbul',
    language: 'tr',
    currency: Currency.TRY,
  },
  {
    country: 'GB',
    timezone: 'Europe/London',
    language: 'en',
    currency: Currency.GBP,
  },
  {
    country: 'DE',
    timezone: 'Europe/Berlin',
    language: 'de',
    currency: Currency.EUR,
  },
] as const;

function randomFrom<T>(items: readonly T[]): T {
  return items[faker.number.int({ min: 0, max: items.length - 1 })];
}

async function main() {
  const startedAt = Date.now();

  console.log(
    `Starting stress seed: inserting ${TOTAL_LEADS} leads in batches of ${BATCH_SIZE}...`,
  );

  const organization = await prisma.organization.findFirst({
    select: { id: true, name: true },
    orderBy: { created_at: 'asc' },
  });

  if (!organization) {
    throw new Error(
      'No organization found. Seed an organization before running seed:stress.',
    );
  }

  const [memberships, pipelineStages, leadSources] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: {
        organization_id: organization.id,
        status: MembershipStatus.ACTIVE,
      },
      select: { user_id: true },
    }),
    prisma.pipelineStage.findMany({
      where: { organization_id: organization.id },
      select: { id: true },
    }),
    prisma.leadSource.findMany({
      where: { organization_id: organization.id, is_active: true },
      select: { id: true },
    }),
  ]);

  if (memberships.length === 0) {
    throw new Error(
      `No ACTIVE organization memberships found for organization ${organization.id}.`,
    );
  }

  if (pipelineStages.length === 0) {
    throw new Error(
      `No pipeline stages found for organization ${organization.id}.`,
    );
  }

  if (leadSources.length === 0) {
    throw new Error(
      `No active lead sources found for organization ${organization.id}.`,
    );
  }

  const assignedAgentIds = memberships.map((membership) => membership.user_id);
  const pipelineStageIds = pipelineStages.map((stage) => stage.id);
  const leadSourceIds = leadSources.map((source) => source.id);

  let inserted = 0;
  const batches = Math.ceil(TOTAL_LEADS / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < batches; batchIndex += 1) {
    const remaining = TOTAL_LEADS - inserted;
    const currentBatchSize = Math.min(BATCH_SIZE, remaining);

    const leadsBatch: Prisma.LeadCreateManyInput[] = Array.from(
      { length: currentBatchSize },
      (_, itemIndex) => {
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const profile = randomFrom(locales);
        const now = Date.now();

        return {
          organization_id: organization.id,
          assigned_agent_id: randomFrom(assignedAgentIds),
          pipeline_stage_id: randomFrom(pipelineStageIds),
          source_id: randomFrom(leadSourceIds),
          first_name: firstName,
          last_name: lastName,
          email: faker.internet.email({
            firstName,
            lastName,
            provider: 'example.com',
          }),
          phone_number: faker.phone.number(),
          country: profile.country,
          timezone: profile.timezone,
          primary_language: profile.language,
          preferred_language:
            faker.helpers.maybe(() => profile.language) ?? null,
          status: randomFrom(leadStatuses),
          priority: randomFrom(priorities),
          estimated_value: faker.number.int({ min: 1_000, max: 50_000 }),
          currency: profile.currency,
          expected_service_date: faker.date.soon({ days: 90 }),
          next_follow_up_at: faker.date.between({
            from: new Date(now),
            to: new Date(now + 1000 * 60 * 60 * 24 * 30),
          }),
        };
      },
    );

    await prisma.lead.createMany({
      data: leadsBatch,
    });

    inserted += currentBatchSize;
    console.log(`Inserted ${inserted} / ${TOTAL_LEADS} leads...`);
  }

  const durationMs = Date.now() - startedAt;
  const durationSeconds = (durationMs / 1000).toFixed(2);

  console.log(
    `Stress seed completed for organization \"${organization.name}\" (${organization.id}) in ${durationSeconds}s.`,
  );
}

main()
  .catch((error) => {
    console.error('Stress seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
