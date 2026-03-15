import { plainToInstance } from 'class-transformer';
import { IsEnum, IsString, validateSync, IsUrl } from 'class-validator';

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
  NODE_ENV: Environment;

  @IsString({ message: 'DATABASE_URL is required' })
  DATABASE_URL: string;

  @IsString({ message: 'JWT_SECRET is required' })
  JWT_SECRET: string;

  @IsUrl(
    { require_tld: false },
    { message: 'FRONTEND_URL must be a valid URL' },
  )
  FRONTEND_URL: string;
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
    // If validation fails, we throw a massive error so the server stops booting
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }
  return validatedConfig;
}
