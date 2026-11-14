import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import type { AvatarStorage } from '@/modules/profiles/application';
import { ProfileFailure } from '@/modules/profiles/domain';

const referencePattern =
  /^avatars\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{32})$/;

@Injectable()
export class R2AvatarStorage implements AvatarStorage {
  private readonly logger = new Logger(R2AvatarStorage.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signingKey: string;
  private readonly ttl: number;
  private readonly maximumBytes: number;
  private readonly contentTypes: Set<string>;
  private readonly cleanupGraceMs: number;

  constructor(
    config: ConfigService,
    private readonly database: DataSource,
  ) {
    const accountId = config.getOrThrow<string>('R2_ACCOUNT_ID');
    const accessKeyId = config.getOrThrow<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.getOrThrow<string>('R2_SECRET_ACCESS_KEY');
    this.signingKey = config.getOrThrow<string>('R2_REFERENCE_SIGNING_KEY');
    this.bucket = config.getOrThrow<string>('R2_BUCKET');
    this.ttl = config.getOrThrow<number>('R2_SIGNED_URL_TTL_SECONDS');
    this.maximumBytes = config.getOrThrow<number>('R2_MAX_UPLOAD_BYTES');
    this.contentTypes = new Set(
      config
        .getOrThrow<string>('R2_ALLOWED_CONTENT_TYPES')
        .split(',')
        .map((item) => item.trim()),
    );
    this.cleanupGraceMs = config.getOrThrow<number>('R2_CLEANUP_GRACE_SECONDS') * 1000;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async createUploadIntent(userId: string, contentType: string, size: number) {
    if (
      !this.contentTypes.has(contentType) ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > this.maximumBytes
    ) {
      throw new ProfileFailure('invalid', 'avatar_upload');
    }
    const nonce = randomUUID();
    const avatar = `avatars/${userId}/${nonce}-${this.sign(userId, nonce)}`;
    try {
      return {
        avatar,
        uploadUrl: await getSignedUrl(
          this.client,
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: avatar,
            ContentType: contentType,
            ContentLength: size,
          }),
          { expiresIn: this.ttl },
        ),
        expiresInSeconds: this.ttl,
        headers: { 'content-type': contentType, 'content-length': String(size) },
      };
    } catch {
      throw new ProfileFailure('dependency');
    }
  }

  async verifyReference(userId: string, reference: string): Promise<void> {
    this.assertReference(userId, reference);
    try {
      const object = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: reference }),
      );
      if (
        !object.ContentType ||
        !this.contentTypes.has(object.ContentType) ||
        !object.ContentLength ||
        object.ContentLength > this.maximumBytes
      ) {
        throw new ProfileFailure('invalid', 'avatar_upload');
      }
    } catch (error) {
      if (error instanceof ProfileFailure) throw error;
      if (
        error instanceof Error &&
        (['NotFound', 'NoSuchKey'].includes(error.name) ||
          ('$metadata' in error &&
            typeof error.$metadata === 'object' &&
            error.$metadata !== null &&
            'httpStatusCode' in error.$metadata &&
            error.$metadata.httpStatusCode === 404))
      ) {
        throw new ProfileFailure('invalid', 'avatar_not_uploaded');
      }
      throw new ProfileFailure('dependency');
    }
  }

  async signReadUrl(userId: string, reference: string): Promise<string> {
    this.assertReference(userId, reference);
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: reference }),
        { expiresIn: this.ttl },
      );
    } catch {
      throw new ProfileFailure('dependency');
    }
  }

  scheduleCleanup(reference: string): void {
    const timer = setTimeout(() => {
      void this.deleteIfUnreferenced(reference);
    }, this.cleanupGraceMs);
    timer.unref();
  }

  private async deleteIfUnreferenced(reference: string): Promise<void> {
    try {
      const rows = (await this.database.query(
        'SELECT 1 FROM profiles WHERE avatar_url = $1 LIMIT 1',
        [reference],
      )) as unknown;
      if (Array.isArray(rows) && rows.length) return;
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: reference }));
    } catch {
      this.logger.warn('Avatar cleanup failed');
    }
  }

  private assertReference(userId: string, reference: string): void {
    const match = referencePattern.exec(reference);
    if (!match || match[1] !== userId || !match[2] || !match[3])
      throw new ProfileFailure('invalid', 'avatar');
    const expected = Buffer.from(this.sign(userId, match[2]), 'hex');
    const actual = Buffer.from(match[3], 'hex');
    if (!timingSafeEqual(expected, actual)) throw new ProfileFailure('invalid', 'avatar');
  }

  private sign(userId: string, nonce: string): string {
    return createHmac('sha256', this.signingKey)
      .update(`${userId}/${nonce}`)
      .digest('hex')
      .slice(0, 32);
  }
}
