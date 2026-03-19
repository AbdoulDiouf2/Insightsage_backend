import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
