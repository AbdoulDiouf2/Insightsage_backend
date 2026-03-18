import { Module, Global } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({
    imports: [PrismaModule, NotificationsModule],
    providers: [AuditLogService],
    exports: [AuditLogService],
})
export class AuditLogModule { }
