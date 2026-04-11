import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermissions, CurrentUser } from '../../auth/decorators';
import { AgentReleasesService } from './agent-releases.service';
import { CreateAgentReleaseDto } from './agent-release.dto';

@ApiTags('Admin — Agent Releases')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequirePermissions({ action: 'manage', resource: 'all' })
@Controller('admin/agent-releases')
export class AgentReleasesController {
  constructor(private readonly agentReleasesService: AgentReleasesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'version', 'platform'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Exécutable de l\'agent' },
        version: { type: 'string', example: '1.2.3' },
        platform: { type: 'string', enum: ['windows', 'linux', 'macos'] },
        arch: { type: 'string', enum: ['x64', 'arm64'], default: 'x64' },
        changelog: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload un exécutable agent (multipart/form-data)' })
  uploadRelease(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateAgentReleaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.agentReleasesService.uploadRelease(file, dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Liste toutes les releases agent' })
  listReleases() {
    return this.agentReleasesService.listReleases();
  }

  @Patch(':id/set-latest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer une release comme la dernière version pour sa plateforme' })
  setLatest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.agentReleasesService.setLatest(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer une release agent' })
  deleteRelease(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.agentReleasesService.deleteRelease(id, userId);
  }
}
