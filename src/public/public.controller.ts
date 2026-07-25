import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContactDto } from './contact.dto';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('contact')
  @HttpCode(200)
  @ApiOperation({ summary: 'Formulaire de demande de démo — landing page' })
  async contact(@Body() dto: ContactDto): Promise<{ ok: boolean }> {
    await this.prisma.demoRequest.create({
      data: { email: dto.email, company: dto.company, message: dto.message },
    });
    // Fire-and-forget — on ne bloque pas la réponse si l'email échoue
    this.notifications.notifyNewDemoRequest(dto).catch(() => {});
    return { ok: true };
  }
}
