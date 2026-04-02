import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateSocialLinkDto {
  @ApiProperty({ description: 'The social media platform (e.g., twitter, linkedin)' })
  @IsNotEmpty()
  @IsString()
  platform: string;

  @ApiProperty({ description: 'The URL to the social media profile' })
  @IsNotEmpty()
  @IsUrl()
  url: string;
}
