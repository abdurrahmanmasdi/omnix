import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({ description: 'The name of the bank' })
  @IsNotEmpty()
  @IsString()
  bank_name: string;

  @ApiProperty({ description: 'The IBAN or account number' })
  @IsNotEmpty()
  @IsString()
  iban: string;

  @ApiPropertyOptional({ description: 'The currency of the bank account', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'The name of the account holder' })
  @IsNotEmpty()
  @IsString()
  account_holder_name: string;

  @ApiPropertyOptional({ description: 'Whether this is the default bank account', default: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
