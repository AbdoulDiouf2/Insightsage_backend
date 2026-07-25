import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContactDto } from './contact.dto';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  private readonly logger = new Logger(PublicController.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('contact')
  @HttpCode(200)
  @ApiOperation({ summary: 'Formulaire de demande de démo — landing page' })
  async contact(@Body() dto: ContactDto): Promise<{ ok: boolean }> {
    const record = await this.prisma.demoRequest.create({
      data: { email: dto.email, company: dto.company, message: dto.message },
    });

    // Fire-and-forget : la réponse { ok: true } est renvoyée même si l'email échoue
    this.notifications.notifyNewDemoRequest(dto).catch((err: Error) => {
      this.logger.error(`[DemoRequest] Notification email failed for ${dto.email}: ${err.message}`);
      this.prisma.auditLog.create({
        data: {
          event: 'demo_request_notification_failed',
          payload: { demoRequestId: record.id, email: dto.email, company: dto.company, error: err.message },
        },
      }).catch(() => {});
    });

    return { ok: true };
  }
}
