import { ApiProperty } from '@nestjs/swagger';

export class UploadDocumentDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'The PDF file to upload to the knowledge base',
  })
  file: any;
}
