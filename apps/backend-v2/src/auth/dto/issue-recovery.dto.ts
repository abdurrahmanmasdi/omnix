import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IssueRecoveryDto {
  @ApiProperty({ description: 'The email address of the account to recover' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
