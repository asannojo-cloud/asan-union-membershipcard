import fs from "fs";
import path from "path";
import sharp from "sharp";
import { Response } from "express";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../../config/env";
import { AppError } from "../../middleware/errorHandler";

/**
 * 조합사업(이벤트) 전단지 이미지 저장. photos.service.ts와 같은 R2/로컬 폴백 패턴을
 * 그대로 따르되, 회원 사진과 섞이지 않도록 "events/" 접두사를 붙인 별도 키를 쓴다.
 */

const r2Configured = !!(env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucketName);

const s3 = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2.accessKeyId!,
        secretAccessKey: env.r2.secretAccessKey!,
      },
    })
  : null;

const LOCAL_DIR = path.resolve(env.photoStorageDir, "..", "events");

function resolveLocalPath(key: string): string | null {
  const fileName = key.split("/").pop() ?? key;
  const resolved = path.join(LOCAL_DIR, fileName);
  if (!resolved.startsWith(LOCAL_DIR + path.sep)) return null;
  return resolved;
}

/** 전단지 이미지를 정규화(리사이즈/webp 변환)해서 저장하고, 저장 키를 반환한다. */
export async function processAndStoreEventImage(buffer: Buffer, eventId: number): Promise<string> {
  let webp: Buffer;
  try {
    webp = await sharp(buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError(400, "이미지 파일이 손상되었거나 지원하지 않는 형식이라 처리할 수 없습니다.");
  }

  const key = `events/${eventId}.webp`;

  if (r2Configured) {
    await s3!.send(
      new PutObjectCommand({ Bucket: env.r2.bucketName!, Key: key, Body: webp, ContentType: "image/webp" })
    );
    return key;
  }

  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  const abs = resolveLocalPath(key);
  if (!abs) throw new AppError(400, "잘못된 이미지 경로입니다.");
  fs.writeFileSync(abs, webp);
  return key;
}

export async function streamEventImage(res: Response, key: string | null) {
  if (!key) return res.status(404).json({ error: "이미지가 등록되어 있지 않습니다." });

  if (r2Configured) {
    try {
      const obj = await s3!.send(new GetObjectCommand({ Bucket: env.r2.bucketName!, Key: key }));
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Content-Type", obj.ContentType ?? "image/webp");
      const body = obj.Body as NodeJS.ReadableStream | undefined;
      if (!body) return res.status(404).json({ error: "이미지가 등록되어 있지 않습니다." });
      return body.pipe(res);
    } catch {
      return res.status(404).json({ error: "이미지가 등록되어 있지 않습니다." });
    }
  }

  const abs = resolveLocalPath(key);
  if (abs && fs.existsSync(abs)) {
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.sendFile(abs);
  }
  return res.status(404).json({ error: "이미지가 등록되어 있지 않습니다." });
}

export async function deleteEventImage(key: string | null) {
  if (!key) return;

  if (r2Configured) {
    try {
      await s3!.send(new DeleteObjectCommand({ Bucket: env.r2.bucketName!, Key: key }));
    } catch {
      // 이미 지워져 있어도 무시 (최선 시도).
    }
    return;
  }

  const abs = resolveLocalPath(key);
  if (abs) {
    try {
      fs.rmSync(abs, { force: true });
    } catch {
      // 위와 동일.
    }
  }
}
