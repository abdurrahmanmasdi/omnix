import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

// 1. Define the allowed environments
enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

// 2. Define the exact shape your .env file MUST have
class EnvironmentVariables {
  @IsEnum(Environment, {
    message: 'NODE_ENV must be development, production, or test',
  })
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt({ message: 'PORT must be a number' })
  @Min(1, { message: 'PORT must be between 1 and 65535' })
  @Max(65535, { message: 'PORT must be between 1 and 65535' })
  PORT: number = 3000;

  @IsString({ message: 'DATABASE_URL is required' })
  @IsNotEmpty({ message: 'DATABASE_URL is required' })
  DATABASE_URL: string;

  @IsString({ message: 'JWT_SECRET is required' })
  @IsNotEmpty({ message: 'JWT_SECRET is required' })
  JWT_SECRET: string;

  @IsString({ message: 'REDIS_URL is required' })
  @IsNotEmpty({ message: 'REDIS_URL is required' })
  REDIS_URL: string;

  @IsOptional()
  @IsUrl(
    { require_tld: false },
    { message: 'FRONTEND_URL must be a valid URL' },
  )
  FRONTEND_URL: string = 'http://localhost:3001';

  @IsOptional()
  @IsBoolean({ message: 'SMTP_ENABLED must be a boolean value' })
  SMTP_ENABLED: boolean = false;
}

// 3. Create the validation function that NestJS will run on startup
export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .filter(Boolean)
      .join('; ');

    throw new Error(`Environment validation failed: ${errorMessages}`);
  }
  return validatedConfig;
}
