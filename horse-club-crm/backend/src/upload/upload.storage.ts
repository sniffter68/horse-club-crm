import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const UPLOAD_DIRECTORY = Symbol('UPLOAD_DIRECTORY');
export const uploadsDirectory = resolve(process.cwd(), 'uploads');
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

export interface UploadedImage { buffer: Buffer; mimetype: string; size: number }

export function serveUploads(app: NestExpressApplication, directory = uploadsDirectory): void {
  app.useStaticAssets(directory, {
    prefix: '/uploads/', index: false, dotfiles: 'ignore', fallthrough: true, maxAge: '1y', immutable: true,
    setHeaders: (response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      // Override the API middleware's no-store only for successfully resolved public files.
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });
}

@Injectable()
export class UploadStorage {
  constructor(@Inject(UPLOAD_DIRECTORY) private readonly directory: string) {}

  async save(file?: UploadedImage): Promise<{ url: string }> {
    if (!file || !file.size) throw new BadRequestException('Выберите изображение');
    const data = file.buffer;
    const valid = file.mimetype === 'image/jpeg' ? data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      : file.mimetype === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.mimetype === 'image/webp' && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
    if (!valid || !Object.hasOwn(IMAGE_TYPES, file.mimetype)) {
      throw new BadRequestException('Допустимы только изображения JPG, PNG и WebP');
    }
    const filename = `${randomUUID()}.${IMAGE_TYPES[file.mimetype]}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(resolve(this.directory, filename), data, { flag: 'wx' });
    return { url: `/uploads/${filename}` };
  }
}
