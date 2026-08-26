import crypto from "crypto";
import { env } from "../config/env";

/**
 * 개인정보 필드 암호화 공용 유틸 (AES-256-GCM). phoneCrypto.ts에서 쓰던 로직을
 * 여러 필드(전화번호, 생년월일, ...)가 공유할 수 있도록 뽑아냈다
 * (2026-08-20 2단계: 생년월일 암호화 작업 중 — 전화번호 쪽 동작은 그대로 유지한 채
 * 내부 구현만 이 공용 모듈에 위임하도록 리팩터링).
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = Buffer.from(env.fieldEncryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY는 base64로 인코딩된 32바이트 값이어야 합니다.");
  }
  return key;
}

/** 평문을 암호화한다. iv + authTag + 암호문을 이어붙여 base64로 반환한다. */
export function encryptField(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** encryptField로 만든 암호문을 원래 문자열로 복호화한다. */
export function decryptField(packed: string | null | undefined): string | null {
  if (!packed) return null;
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
