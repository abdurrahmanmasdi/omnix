import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class ClinicMemberDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() email!: string;
  @ApiProperty() roleId!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) joinedAt!: Date;
}
export class PendingClinicInvitationDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty() issuer!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}
export class GrantableClinicRoleDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
export class ClinicInvitationIssuedDto {
  @ApiProperty() invitationId!: string;
  @ApiProperty() token!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
  @ApiProperty() createsAccount!: boolean;
}
export class ClinicInvitationRevokedDto {
  @ApiProperty() revoked!: boolean;
}

export class ChangeClinicMemberRoleDto {
  @ApiProperty() @IsUUID() roleId!: string;
}
export class ClinicMemberChangedDto {
  @ApiProperty() changed!: boolean;
}
