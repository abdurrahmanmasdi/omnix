import { IsString, IsOptional } from 'class-validator';

export class UpdateExperienceDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  patientCountry?: string;

  @IsString()
  @IsOptional()
  procedureType?: string;

  @IsString()
  @IsOptional()
  storyText?: string;

  @IsString()
  @IsOptional()
  beforeImageUrl?: string;

  @IsString()
  @IsOptional()
  afterImageUrl?: string;
}
