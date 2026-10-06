import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class EmbeddedSignupDto {
  @ApiProperty({
    description: 'Single-use Facebook Login for Business authorization code',
  })
  @IsString()
  @Length(1, 4096)
  code: string;
}

export class EmbeddedSignupConfigDto {
  @ApiProperty() available: boolean;
  @ApiProperty({ nullable: true, type: String }) appId: string | null;
  @ApiProperty({ nullable: true, type: String }) configId: string | null;
  @ApiProperty() graphVersion: string;
}
