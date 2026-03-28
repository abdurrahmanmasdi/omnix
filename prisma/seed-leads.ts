import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  Currency,
  Gender,
  LeadStatus,
  MembershipStatus,
  PrismaClient,
  Priority,
} from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function main() {
  console.log('🌱 Starting leads seed...');

  const organization = await prisma.organization.findFirst({
    select: { id: true, name: true },
  });

  if (!organization) {
    throw new Error(
      'No organization found. Create an organization before running this seed.',
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
      select: { id: true, order_index: true },
      orderBy: { order_index: 'asc' },
    }),
    prisma.leadSource.findMany({
      where: { organization_id: organization.id, is_active: true },
      select: { id: true },
    }),
  ]);

  const agentIds = memberships.map((m) => m.user_id);
  const stageIds = pipelineStages.map((stage) => stage.id);
  const sourceIds = leadSources.map((source) => source.id);

  const leads = [
    {
      first_name: 'Ahmet',
      last_name: 'Yilmaz',
      native_name: 'Ahmet Yilmaz',
      gender: Gender.MALE,
      email: 'ahmet.yilmaz@anadolutech.com',
      phone_number: '+905325551122',
      country: 'TR',
      timezone: 'Europe/Istanbul',
      primary_language: 'tr',
      preferred_language: 'en',
      social_links: { linkedin: 'https://linkedin.com/in/ahmet-yilmaz' },
      status: LeadStatus.OPEN,
      priority: Priority.HOT,
      estimated_value: '18500.00',
      currency: Currency.TRY,
      expected_service_date: daysFromNow(12),
      next_follow_up_at: daysFromNow(2),
    },
    {
      first_name: 'Fatma',
      last_name: 'Kaya',
      native_name: 'Fatma Kaya',
      gender: Gender.FEMALE,
      email: 'fatma.kaya@bosphoruslogistics.com',
      phone_number: '+905445551133',
      country: 'TR',
      timezone: 'Europe/Istanbul',
      primary_language: 'tr',
      preferred_language: null,
      social_links: { linkedin: 'https://linkedin.com/in/fatma-kaya' },
      status: LeadStatus.WON,
      priority: Priority.WARM,
      estimated_value: '9200.00',
      currency: Currency.TRY,
      expected_service_date: daysFromNow(6),
      next_follow_up_at: null,
    },
    {
      first_name: 'James',
      last_name: 'Walker',
      native_name: null,
      gender: Gender.MALE,
      email: 'j.walker@northbridge.co.uk',
      phone_number: '+447700900111',
      country: 'GB',
      timezone: 'Europe/London',
      primary_language: 'en',
      preferred_language: null,
      social_links: { linkedin: 'https://linkedin.com/in/james-walker' },
      status: LeadStatus.OPEN,
      priority: Priority.COLD,
      estimated_value: '4200.00',
      currency: Currency.EUR,
      expected_service_date: daysFromNow(28),
      next_follow_up_at: daysFromNow(7),
    },
    {
      first_name: 'Emma',
      last_name: 'Brown',
      native_name: null,
      gender: Gender.FEMALE,
      email: 'emma.brown@skylinepartners.uk',
      phone_number: '+447700900122',
      country: 'GB',
      timezone: 'Europe/London',
      primary_language: 'en',
      preferred_language: 'tr',
      social_links: { linkedin: 'https://linkedin.com/in/emma-brown' },
      status: LeadStatus.LOST,
      priority: Priority.WARM,
      estimated_value: '7600.00',
      currency: Currency.USD,
      expected_service_date: null,
      next_follow_up_at: null,
    },
    {
      first_name: 'Omar',
      last_name: 'Al Nuaimi',
      native_name: 'عمر النعيمي',
      gender: Gender.MALE,
      email: 'omar@desertflow.ae',
      phone_number: '+971501112233',
      country: 'AE',
      timezone: 'Asia/Dubai',
      primary_language: 'ar',
      preferred_language: 'en',
      social_links: { linkedin: 'https://linkedin.com/in/omar-alnuaimi' },
      status: LeadStatus.OPEN,
      priority: Priority.HOT,
      estimated_value: '29000.00',
      currency: Currency.USD,
      expected_service_date: daysFromNow(14),
      next_follow_up_at: daysFromNow(1),
    },
    {
      first_name: 'Layla',
      last_name: 'Hassan',
      native_name: 'ليلى حسن',
      gender: Gender.FEMALE,
      email: 'layla.hassan@gulfcare.ae',
      phone_number: '+971521234567',
      country: 'AE',
      timezone: 'Asia/Dubai',
      primary_language: 'ar',
      preferred_language: 'en',
      social_links: { linkedin: 'https://linkedin.com/in/layla-hassan' },
      status: LeadStatus.WON,
      priority: Priority.HOT,
      estimated_value: '34000.00',
      currency: Currency.USD,
      expected_service_date: daysFromNow(3),
      next_follow_up_at: null,
    },
    {
      first_name: 'Mustafa',
      last_name: 'Demir',
      native_name: 'Mustafa Demir',
      gender: Gender.MALE,
      email: 'mustafa.demir@ankarafleet.com',
      phone_number: '+905302223344',
      country: 'TR',
      timezone: 'Europe/Istanbul',
      primary_language: 'tr',
      preferred_language: null,
      social_links: { linkedin: 'https://linkedin.com/in/mustafa-demir' },
      status: LeadStatus.LOST,
      priority: Priority.COLD,
      estimated_value: '6100.00',
      currency: Currency.TRY,
      expected_service_date: null,
      next_follow_up_at: null,
    },
    {
      first_name: 'Zeynep',
      last_name: 'Aydin',
      native_name: 'Zeynep Aydin',
      gender: Gender.FEMALE,
      email: 'zeynep.aydin@egefinance.com',
      phone_number: '+905553334455',
      country: 'TR',
      timezone: 'Europe/Istanbul',
      primary_language: 'tr',
      preferred_language: 'en',
      social_links: { linkedin: 'https://linkedin.com/in/zeynep-aydin' },
      status: LeadStatus.OPEN,
      priority: Priority.WARM,
      estimated_value: '11800.00',
      currency: Currency.EUR,
      expected_service_date: daysFromNow(10),
      next_follow_up_at: daysFromNow(3),
    },
    {
      first_name: 'Ali',
      last_name: 'Al Mansoori',
      native_name: 'علي المنصوري',
      gender: Gender.MALE,
      email: 'ali@oasisventures.ae',
      phone_number: '+971561998877',
      country: 'AE',
      timezone: 'Asia/Dubai',
      primary_language: 'ar',
      preferred_language: 'en',
      social_links: { linkedin: 'https://linkedin.com/in/ali-mansoori' },
      status: LeadStatus.OPEN,
      priority: Priority.HOT,
      estimated_value: '26000.00',
      currency: Currency.USD,
      expected_service_date: daysFromNow(18),
      next_follow_up_at: daysFromNow(4),
    },
    {
      first_name: 'Sophie',
      last_name: 'Miller',
      native_name: null,
      gender: Gender.FEMALE,
      email: 's.miller@brightpath.uk',
      phone_number: '+447700900133',
      country: 'GB',
      timezone: 'Europe/London',
      primary_language: 'en',
      preferred_language: null,
      social_links: { linkedin: 'https://linkedin.com/in/sophie-miller' },
      status: LeadStatus.LOST,
      priority: Priority.COLD,
      estimated_value: '5300.00',
      currency: Currency.EUR,
      expected_service_date: null,
      next_follow_up_at: null,
    },
    {
      first_name: 'Ibrahim',
      last_name: 'Kara',
      native_name: 'Ibrahim Kara',
      gender: Gender.MALE,
      email: 'ibrahim.kara@mediterra.com',
      phone_number: '+905397776655',
      country: 'TR',
      timezone: 'Europe/Istanbul',
      primary_language: 'tr',
      preferred_language: 'en',
      social_links: { linkedin: 'https://linkedin.com/in/ibrahim-kara' },
      status: LeadStatus.WON,
      priority: Priority.WARM,
      estimated_value: '14750.00',
      currency: Currency.TRY,
      expected_service_date: daysFromNow(5),
      next_follow_up_at: null,
    },
    {
      first_name: 'Nora',
      last_name: 'Abdullah',
      native_name: 'نورا عبدالله',
      gender: Gender.FEMALE,
      email: 'nora@falconsystems.ae',
      phone_number: '+971509876543',
      country: 'AE',
      timezone: 'Asia/Dubai',
      primary_language: 'ar',
      preferred_language: 'en',
      social_links: { linkedin: 'https://linkedin.com/in/nora-abdullah' },
      status: LeadStatus.OPEN,
      priority: Priority.WARM,
      estimated_value: '19800.00',
      currency: Currency.USD,
      expected_service_date: daysFromNow(16),
      next_follow_up_at: daysFromNow(2),
    },
  ];

  const data = leads.map((lead, index) => ({
    organization_id: organization.id,
    pipeline_stage_id:
      stageIds.length > 0 ? stageIds[index % stageIds.length] : null,
    source_id:
      sourceIds.length > 0 ? sourceIds[index % sourceIds.length] : null,
    assigned_agent_id:
      agentIds.length > 0 ? agentIds[index % agentIds.length] : null,
    ...lead,
  }));

  const result = await prisma.lead.createMany({
    data,
  });

  console.log(
    `✅ Seeded ${result.count} leads into organization "${organization.name}" (${organization.id})`,
  );
}

main()
  .catch((error) => {
    console.error('❌ Lead seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
