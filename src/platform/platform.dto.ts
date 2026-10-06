import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
export class PlatformEmailDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
}
export class PlatformClinicDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() memberCount!: number;
  @ApiProperty({ type: [String] }) ownerEmails!: string[];
}
export class PlatformInvitationDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() issuer!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}
export class PlatformLinkDto {
  @ApiProperty() invitationId!: string;
  @ApiProperty() link!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}
export class PlatformRevokedDto {
  @ApiProperty() revoked!: boolean;
}
