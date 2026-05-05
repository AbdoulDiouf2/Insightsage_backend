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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync } from 'fs';

const RELEASE_TEMP_DIR = join(tmpdir(), 'cockpit-releases');
try { mkdirSync(RELEASE_TEMP_DIR, { recursive: true }); } catch {}
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
import { ConfirmAgentReleaseDto, CreateAgentReleaseDto, PresignedUploadQueryDto } from './agent-release.dto';

@ApiTags('Admin — Agent Releases')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequirePermissions({ action: 'manage', resource: 'all' })
@Controller('admin/agent-releases')
export class AgentReleasesController {
  constructor(private readonly agentReleasesService: AgentReleasesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: RELEASE_TEMP_DIR,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
    }),
    limits: { fileSize: 600 * 1024 * 1024 }, // 600 MB max
  }))
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

  @Get('presigned-upload')
  @ApiOperation({ summary: 'URL pré-signée pour upload direct browser → MinIO' })
  getPresignedUpload(@Query() query: PresignedUploadQueryDto) {
    return this.agentReleasesService.getPresignedUpload(
      query.filename,
      query.contentType,
      query.version,
      query.platform,
      query.arch,
    );
  }

  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Confirmer upload MinIO direct et créer la release en DB' })
  confirmRelease(
    @Body() dto: ConfirmAgentReleaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.agentReleasesService.confirmRelease(dto, userId);
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
