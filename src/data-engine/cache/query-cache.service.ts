import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryResult } from '../contracts/query-result';
import { QueryFailure } from '../contracts/query-error';

@Injectable()
export class QueryCacheService {
  constructor(private readonly prisma: PrismaService) {}
  private key(): Buffer {
    const raw = process.env.DATA_ENGINE_V2_ENCRYPTION_KEY;
    const key = raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
    if (key.length !== 32) throw new QueryFailure('NOT_CONFIGURED', 'Clé de chiffrement V2 non configurée');
    return key;
  }
  private approved() {
    if (process.env.NODE_ENV !== 'test' && process.env.DATA_ENGINE_V2_PERSISTENCE_APPROVED !== 'true')
      throw new QueryFailure('NOT_CONFIGURED', 'Conservation V2 non approuvée');
  }
  encrypt(result: QueryResult) {
    this.approved();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(result), 'utf8'), cipher.final(), cipher.getAuthTag()]);
    const keyId = process.env.DATA_ENGINE_V2_KEY_ID || (process.env.NODE_ENV === 'test' ? 'phase1-test' : undefined);
    if (!keyId) throw new QueryFailure('NOT_CONFIGURED', 'Identifiant de clé V2 non configuré');
    return { ciphertext, iv, keyId };
  }
  decrypt(ciphertext: Uint8Array, iv: Uint8Array): QueryResult {
    const bytes = Buffer.from(ciphertext);
    if (bytes.length < 16) throw new QueryFailure('INTERNAL_ERROR', 'Résultat chiffré invalide');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv));
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString('utf8'));
  }
  async get(organizationId: string, fingerprint: string, registryVersion: string): Promise<QueryResult | null> {
    this.approved();
    const row = await this.prisma.dataQueryCacheV2.findUnique({
      where: { organizationId_queryFingerprint_registryVersion: {
        organizationId, queryFingerprint: fingerprint, registryVersion,
      } },
    });
    if (!row || row.expiresAt <= new Date()) return null;
    const result = this.decrypt(row.resultCiphertext, row.resultIv);
    return { ...result, meta: { ...result.meta, cache: 'backend', cachedAt: row.createdAt.toISOString(),
      generatedAt: new Date().toISOString() } };
  }
  async put(organizationId: string, fingerprint: string, registryVersion: string,
    result: QueryResult, ttlSeconds: number) {
    this.approved();
    const ttl = Math.min(Math.max(1, ttlSeconds), 300);
    const encrypted = this.encrypt(result);
    await this.prisma.dataQueryCacheV2.upsert({
      where: { organizationId_queryFingerprint_registryVersion: {
        organizationId, queryFingerprint: fingerprint, registryVersion,
      } },
      create: {
        organizationId, queryFingerprint: fingerprint, registryVersion,
        resultCiphertext: encrypted.ciphertext, resultIv: encrypted.iv, encryptionKeyId: encrypted.keyId,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
      update: {
        resultCiphertext: encrypted.ciphertext, resultIv: encrypted.iv, encryptionKeyId: encrypted.keyId,
        createdAt: new Date(), expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
  }
  @Interval(60000)
  async purgeExpired(): Promise<number> {
    if (process.env.DATA_ENGINE_V2_ENABLED !== 'true' ||
        process.env.NODE_ENV !== 'test' && process.env.DATA_ENGINE_V2_PERSISTENCE_APPROVED !== 'true') return 0;
    this.approved();
    const result = await this.prisma.dataQueryCacheV2.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    return result.count;
  }
}
