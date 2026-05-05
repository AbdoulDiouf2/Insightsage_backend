import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { join, basename, extname, dirname, resolve } from 'path';
import { createReadStream } from 'fs';
import * as fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private readonly uploadDir: string;
  private readonly appUrl: string;

  constructor(private configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR') || 'uploads';
    this.appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    this.initS3Client();
  }

  async onModuleInit() {
    await fs.ensureDir(this.uploadDir);
    await fs.ensureDir(join(this.uploadDir, 'temp'));
  }

  private initS3Client() {
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    const endpoint = this.configService.get<string>('R2_ENDPOINT');

    if (accessKeyId && secretAccessKey && endpoint) {
      this.s3Client = new S3Client({
        region: 'us-east-1',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true, // obligatoire avec MinIO (path-style vs virtual-hosted)
        requestHandler: new NodeHttpHandler({
          requestTimeout: 900000,   // 15min — gros binaires agent
          connectionTimeout: 5000,
        }),
      });
    }
  }

  private isPathSafe(pathToCheck: string): boolean {
    const resolvedPath = resolve(pathToCheck);
    const resolvedUploadDir = resolve(this.uploadDir);
    return resolvedPath.startsWith(resolvedUploadDir);
  }

  /** Génère une URL pré-signée pour upload direct browser → MinIO (valide 1h). Retourne null si MinIO non configuré. */
  async getPresignedUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string | null> {
    if (!this.s3Client) return null;
    const bucket = this.configService.get<string>('R2_BUCKET_NAME');
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async uploadFile(file: Express.Multer.File, folder = 'temp', customKey?: string): Promise<string> {
    const fileName = customKey ?? `${uuidv4()}-${file.originalname}`;
    const key = `${folder}/${fileName}`;

    // Disk storage → stream; memory storage → buffer
    const body = file.path ? createReadStream(file.path) : file.buffer;

    if (this.s3Client) {
      try {
        const bucket = this.configService.get<string>('R2_BUCKET_NAME');
        const publicUrl = this.configService.get<string>('R2_PUBLIC_URL');
        await this.s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentLength: file.size,
          ContentType: file.mimetype,
          ContentDisposition: `attachment; filename="${file.originalname}"`,
        }));
        if (file.path) await fs.remove(file.path).catch(() => {});
        return `${publicUrl}/${key}`;
      } catch (e) {
        this.logger.error(`R2 Upload fallback: ${e.message}`);
      }
    }

    const localPath = join(this.uploadDir, key);
    if (!this.isPathSafe(localPath)) {
      throw new Error('Invalid upload path');
    }
    await fs.ensureDir(dirname(localPath));
    if (file.path) {
      await fs.move(file.path, localPath, { overwrite: true });
    } else {
      await fs.writeFile(localPath, file.buffer);
    }
    return `${this.appUrl}/uploads/${key}`;
  }

  /**
   * Déplace et renomme les fichiers : temp/UUID-name.png -> bugs/BUG-ID/BUG-ID_1.png
   */
  async confirmUploads(urls: string[], bugId: string): Promise<string[]> {
    const finalUrls: string[] = [];
    const bucket = this.configService.get<string>('R2_BUCKET_NAME');
    const publicUrl = this.configService.get<string>('R2_PUBLIC_URL');

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const originalFileName = basename(url);
      const extension = extname(originalFileName);
      const newFileName = `${bugId}_${i + 1}${extension}`; // BR-2024-001_1.png
      
      const oldKey = `temp/${originalFileName}`;
      const newKey = `bugs/${bugId}/${newFileName}`;

      if (this.s3Client && publicUrl && url.includes(publicUrl)) {
        try {
          // R2 Move (Copy + Delete)
          await this.s3Client.send(new CopyObjectCommand({
            Bucket: bucket, CopySource: `${bucket}/${oldKey}`, Key: newKey,
          }));
          await this.s3Client.send(new DeleteObjectCommand({
            Bucket: bucket, Key: oldKey,
          }));
          finalUrls.push(`${publicUrl}/${newKey}`);
          continue;
        } catch (e) {
          this.logger.error(`R2 Move failed: ${e.message}`);
        }
      }

      // Local Move
      const oldPath = join(this.uploadDir, 'temp', originalFileName);
      const newDir = join(this.uploadDir, 'bugs', bugId);
      const newPath = join(newDir, newFileName);

      if (!this.isPathSafe(oldPath) || !this.isPathSafe(newPath)) {
        this.logger.error(`Path traversal attempt blocked: ${oldPath} -> ${newPath}`);
        finalUrls.push(url);
        continue;
      }

      if (await fs.pathExists(oldPath)) {
        await fs.ensureDir(newDir);
        await fs.move(oldPath, newPath, { overwrite: true });
        finalUrls.push(`${this.appUrl}/uploads/bugs/${bugId}/${newFileName}`);
      } else {
        finalUrls.push(url);
      }
    }

    return finalUrls;
  }

  /**
   * Supprime un fichier depuis son URL publique (R2 ou local).
   * Extrait la clé depuis l'URL et tente la suppression R2, sinon supprime le fichier local.
   */
  async deleteFile(fileUrl: string): Promise<void> {
    const publicUrl = this.configService.get<string>('R2_PUBLIC_URL');
    const bucket = this.configService.get<string>('R2_BUCKET_NAME');

    if (this.s3Client && publicUrl && fileUrl.startsWith(publicUrl)) {
      const key = fileUrl.slice(publicUrl.length + 1); // retire le slash
      try {
        await this.s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return;
      } catch (e) {
        this.logger.error(`R2 Delete failed for ${key}: ${e.message}`);
      }
    }

    // Fallback local : retrouve le chemin depuis l'URL APP_URL
    const appUrlBase = `${this.appUrl}/uploads/`;
    if (fileUrl.startsWith(appUrlBase)) {
      const relativePath = fileUrl.slice(appUrlBase.length);
      const localPath = join(this.uploadDir, relativePath);

      if (!this.isPathSafe(localPath)) {
        this.logger.warn(`Potential path traversal attempt blocked during delete: ${fileUrl}`);
        return;
      }
      try {
        await fs.remove(localPath);
      } catch (e) {
        this.logger.error(`Local delete failed for ${localPath}: ${e.message}`);
      }
    }
  }
}
