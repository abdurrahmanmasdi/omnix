import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUserGuard } from './guards/jwt-user.guard';
import { LocaleResponseDto, UpdateLocaleDto } from './dto/update-locale.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtUserGuard)
@Controller('users/me')
export class UserLocaleController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch('locale')
  @ApiOkResponse({ type: LocaleResponseDto })
  updateLocale(
    @Req() req: { user: { id: string } },
    @Body() dto: UpdateLocaleDto,
  ) {
    return this.prisma.user.update({
      where: { id: req.user.id },
      data: { locale: dto.locale },
      select: { locale: true },
    });
  }
}
