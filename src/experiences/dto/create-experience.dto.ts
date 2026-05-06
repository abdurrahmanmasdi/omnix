import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsUrl,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateExperienceDto {
  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(3, { message: 'Title must be at least 3 characters long' })
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title!: string;

  @IsOptional()
  @IsString({ message: 'Patient country must be a string' })
  @MaxLength(100, { message: 'Patient country must not exceed 100 characters' })
  patientCountry?: string;

  @IsOptional()
  @IsString({ message: 'Procedure type must be a string' })
  @MaxLength(150, { message: 'Procedure type must not exceed 150 characters' })
  procedureType?: string;

  @IsString({ message: 'Story text must be a string' })
  @IsNotEmpty({ message: 'Story text is required' })
  @MinLength(10, { message: 'Story text must be at least 10 characters long' })
  @MaxLength(5000, { message: 'Story text must not exceed 5000 characters' })
  storyText!: string;

  @IsOptional()
  @IsString({ message: 'Before image URL must be a string' })
  @IsUrl({}, { message: 'Before image URL must be a valid URL' })
  beforeImageUrl?: string;

  @IsOptional()
  @IsString({ message: 'After image URL must be a string' })
  @IsUrl({}, { message: 'After image URL must be a valid URL' })
  afterImageUrl?: string;
}
