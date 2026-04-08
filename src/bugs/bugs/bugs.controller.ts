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
  UploadedFile
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BugsService } from './bugs.service';
import { StorageService } from '../../storage/storage.service';
import { CreateBugDto, UpdateBugStatusDto, AddCommentDto } from '../dto/bug.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OrganizationId } from '../../auth/decorators/organization.decorator';
import type { User } from '@prisma/client';
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
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
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
  @ApiOperation({ summary: 'Assigner un bug à un développeur' })
  assign(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.bugsService.assign(id, user.id);
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
