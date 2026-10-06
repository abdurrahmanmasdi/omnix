import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ChannelProvider } from '@prisma/client';

export class CreateChannelDto {
  @ApiProperty({ enum: ChannelProvider })
  @IsEnum(ChannelProvider)
  provider: ChannelProvider;

  @ApiProperty({
    description:
      'The Account ID for the provider (e.g., WhatsApp Phone Number ID)',
  })
  @IsString()
  @IsNotEmpty()
  providerAccountId: string;

  @ApiProperty({
    description: 'The Access Token or Secret for the provider',
  })
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}
