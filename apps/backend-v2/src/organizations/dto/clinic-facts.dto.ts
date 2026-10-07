import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  IsIn,
} from 'class-validator';

export class ClinicTreatmentDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty() @IsNumber() @Min(0) priceMin: number;
  @ApiProperty() @IsNumber() @Min(0) priceMax: number;
  @ApiProperty({ enum: ['EUR', 'USD', 'TRY', 'GBP'] })
  @IsIn(['EUR', 'USD', 'TRY', 'GBP'])
  currency: string;
  @ApiProperty() @IsString() @MaxLength(100) unit: string;
  @ApiProperty() @IsString() @MaxLength(2000) included: string;
}
export class ClinicDoctorDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty() @IsString() @MaxLength(200) role: string;
  @ApiProperty() @IsInt() @Min(0) years: number;
}
export class ClinicOfferDto {
  @ApiProperty() @IsString() @MaxLength(2000) text: string;
  @ApiProperty() @IsBoolean() enabled: boolean;
  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  validFrom: string;
  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  validTo: string;
}
export class ClinicFactsDto {
  @ApiProperty({ type: [ClinicTreatmentDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ClinicTreatmentDto)
  treatments: ClinicTreatmentDto[];
  @ApiProperty() @IsString() @MaxLength(4000) warranty: string;
  @ApiProperty({ type: [ClinicDoctorDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ClinicDoctorDto)
  doctors: ClinicDoctorDto[];
  @ApiProperty() @IsString() @MaxLength(4000) process: string;
  @ApiProperty() @IsString() @MaxLength(500) days: string;
  @ApiProperty() @IsString() @MaxLength(2000) location: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  paymentMethods: string[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  languages: string[];
  @ApiProperty({ type: [ClinicOfferDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ClinicOfferDto)
  offers: ClinicOfferDto[];
}
export class SaveClinicFactsDto {
  @ApiProperty({
    description: 'Latest saved version, or zero for the first draft',
  })
  @IsInt()
  @Min(0)
  expectedVersion: number;
  @ApiProperty({ type: ClinicFactsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ClinicFactsDto)
  facts: ClinicFactsDto;
}
export class ApproveClinicFactsDto {
  @ApiProperty() @IsInt() @Min(1) version: number;
}
export class ClinicFactRevisionDto {
  @ApiProperty() version: number;
  @ApiProperty({ type: ClinicFactsDto }) facts: ClinicFactsDto;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  approvedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) approvedBy: string | null;
}
export class ClinicFactSheetDto {
  @ApiProperty({ type: ClinicFactRevisionDto, nullable: true })
  latest: ClinicFactRevisionDto | null;
  @ApiProperty({ type: ClinicFactRevisionDto, nullable: true })
  approved: ClinicFactRevisionDto | null;
}
