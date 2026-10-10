import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, ValidateIf } from 'class-validator';
import { TOPICS, Topic } from '../weekly-topics';

export const WEEKLY_PERMISSIONS = [
  'analytics:view',
  'leads:view',
  'leads:read:all',
  'leads:read:messages',
  'view_conversations',
];
export const METHODOLOGY = [
  'surviving_records',
  'all_recorded_activity',
  'legacy_origin',
  'provider_acceptance',
  'reply_interval',
  'phone_excluded',
  'handoff_retention',
  'approximate_topics',
  'consultations_unavailable',
] as const;
export class WeeklyReportQueryDto {
  @ApiPropertyOptional({ type: String, pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekStart?: string;
}
export class WeeklyPeriodDto {
  @ApiProperty() weekStart: string;
  @ApiProperty() weekEnd: string;
  @ApiProperty({ format: 'date-time' }) startUtc: string;
  @ApiProperty({ format: 'date-time' }) endUtc: string;
  @ApiProperty({ format: 'date-time' }) cutoffUtc: string;
  @ApiProperty({ enum: ['Europe/Istanbul'] }) timezone: 'Europe/Istanbul';
  @ApiProperty() inProgress: boolean;
}
export class WeeklyActivityDto {
  @ApiProperty({ type: 'integer', minimum: 0 }) aiReplies: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) staffDashboardReplies: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) staffPhoneMessages: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) denominator: number;
  @ApiProperty({ type: Number, nullable: true }) aiPercent: number | null;
  @ApiProperty({ type: Number, nullable: true }) staffPercent: number | null;
}
export class WeeklySenderIntervalDto {
  @ApiProperty({ type: 'integer', minimum: 0 }) replied: number;
  @ApiProperty({ type: Number, nullable: true }) medianSeconds: number | null;
}
export class WeeklyReplyIntervalDto {
  @ApiProperty({ type: 'integer', minimum: 0 }) opportunities: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) replied: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) pending: number;
  @ApiProperty({ type: Number, nullable: true }) medianSeconds: number | null;
  @ApiProperty({ type: Number, nullable: true }) p90Seconds: number | null;
  @ApiProperty({ type: WeeklySenderIntervalDto }) ai: WeeklySenderIntervalDto;
  @ApiProperty({ type: WeeklySenderIntervalDto })
  staff: WeeklySenderIntervalDto;
}
export class WeeklyConsultationsDto {
  @ApiProperty({ type: Number, nullable: true, enum: [null] }) value: null;
  @ApiProperty({ enum: ['not_tracked'] }) availability: 'not_tracked';
  @ApiProperty({ enum: ['consultation_records_unavailable'] })
  reason: 'consultation_records_unavailable';
}
export class WeeklyTopicDto {
  @ApiProperty({ enum: TOPICS }) id: Topic;
  @ApiProperty({ type: 'integer', minimum: 0 }) conversations: number;
}
export class WeeklyCoverageDto {
  @ApiProperty({ type: 'integer', minimum: 0 }) legacyOriginMessages: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  unresolvedHandoffReferences: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  topicClassifiedConversations: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  topicUnclassifiedConversations: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) excludedPhoneMessages: number;
}
export class WeeklyReportDto {
  @ApiProperty({ type: 'integer', enum: [1] }) version: 1;
  @ApiProperty({ type: WeeklyPeriodDto }) period: WeeklyPeriodDto;
  @ApiProperty({ format: 'date-time' }) generatedAt: string;
  @ApiProperty({ format: 'date-time' }) asOf: string;
  @ApiProperty({ type: 'integer', minimum: 0 }) newLeads: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) activeConversations: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) patientMessages: number;
  @ApiProperty({ type: WeeklyActivityDto }) activity: WeeklyActivityDto;
  @ApiProperty({ type: WeeklyReplyIntervalDto })
  replyInterval: WeeklyReplyIntervalDto;
  @ApiProperty({ type: 'integer', minimum: 0 })
  handedToTeamConversations: number;
  @ApiProperty({ type: WeeklyConsultationsDto })
  consultations: WeeklyConsultationsDto;
  @ApiProperty({ type: [WeeklyTopicDto] }) topics: WeeklyTopicDto[];
  @ApiProperty({ type: WeeklyCoverageDto }) coverage: WeeklyCoverageDto;
  @ApiProperty({ enum: METHODOLOGY, isArray: true })
  methodology: (typeof METHODOLOGY)[number][];
}
export class WeeklyReportAccessDto {
  @ApiProperty() allowed: boolean;
}
