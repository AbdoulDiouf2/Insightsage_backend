import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { join, basename, extname } from 'path';
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
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async uploadFile(file: Express.Multer.File, folder = 'temp'): Promise<string> {
    const fileName = `${uuidv4()}-${file.originalname}`;
    const key = `${folder}/${fileName}`;

    if (this.s3Client) {
      try {
        const bucket = this.configService.get<string>('R2_BUCKET_NAME');
        const publicUrl = this.configService.get<string>('R2_PUBLIC_URL');
        await this.s3Client.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: file.buffer, ContentType: file.mimetype,
        }));
        return `${publicUrl}/${key}`;
      } catch (e) {
        this.logger.error(`R2 Upload fallback: ${e.message}`);
      }
    }

    const localPath = join(this.uploadDir, key);
    await fs.ensureDir(join(this.uploadDir, folder));
    await fs.writeFile(localPath, file.buffer);
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
}
