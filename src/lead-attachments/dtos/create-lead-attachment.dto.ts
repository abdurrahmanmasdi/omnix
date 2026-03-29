import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateLeadAttachmentDto {
  @ApiProperty({ example: 'contract-v1.pdf' })
  @IsString()
  @IsNotEmpty()
  file_name: string;

  @ApiProperty({
    example: 'https://files.example.com/contracts/contract-v1.pdf',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  file_url: string;
}
