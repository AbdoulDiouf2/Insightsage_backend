import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BugsService } from './bugs.service';
import { StorageService } from '../../storage/storage.service';
import { CreateBugDto, UpdateBugStatusDto, AddCommentDto, AssignBugDto } from '../dto/bug.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OrganizationId } from '../../auth/decorators/organization.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Bugs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/bugs')
export class BugsController {
  constructor(
    private readonly bugsService: BugsService,
    private readonly storageService: StorageService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Uploader une capture d\'écran' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /image\/(jpeg|png|gif|webp|svg\+xml)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const url = await this.storageService.uploadFile(file);
    return { url };
  }

  @Post()
  @ApiOperation({ summary: 'Signaler un nouveau bug' })
  create(
    @Body() createBugDto: CreateBugDto,
    @CurrentUser() user: any,
    @OrganizationId() orgId: string,
  ) {
    return this.bugsService.create(createBugDto, user.id, orgId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les bugs' })
  findAll(
    @CurrentUser() user: any,
    @OrganizationId() orgId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('module') module?: string,
  ) {
    // Si c'est un admin, on peut lister tous les bugs ou filtrer par org
    const isSuperAdmin = user.userRoles?.some(ur => ur.role.name === 'superadmin');
    
    return this.bugsService.findAll(isSuperAdmin ? undefined : orgId, { status, priority, module });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques des bugs (Admin seulement)' })
  getStats() {
    return this.bugsService.getStats();
  }

  @Get('comments/recent')
  @ApiOperation({ summary: 'Commentaires récents pour le centre de notifications' })
  getRecentComments(@Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.bugsService.getRecentComments(sinceDate);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un bug' })
  findOne(@Param('id') id: string) {
    return this.bugsService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mettre à jour le statut d\'un bug (Admin)' })
  updateStatus(
    @Param('id') id: string, 
    @Body() updateBugStatusDto: UpdateBugStatusDto
  ) {
    return this.bugsService.updateStatus(id, updateBugStatusDto);
  }

  @Patch(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Assigner un bug à un développeur (admin only)' })
  assign(
    @Param('id') id: string,
    @Body() assignBugDto: AssignBugDto,
  ) {
    return this.bugsService.assign(id, assignBugDto.userId ?? null);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Ajouter un commentaire' })
  addComment(
    @Param('id') id: string,
    @Body() addCommentDto: AddCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.bugsService.addComment(id, addCommentDto, user.id);
  }
}
