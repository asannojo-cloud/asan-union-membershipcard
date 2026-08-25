import crypto from "crypto";
import { env } from "../config/env";

/**
 * 휴대폰번호 필드 암호화(AES-256-GCM) + 조회용 해시(HMAC-SHA256).
 *
 * DB 컬럼에는 평문 phone 대신 phone_enc(암호문)와 phone_hash(조회/중복확인용 해시)를
 * 저장한다 — 암호문 자체로는 "WHERE phone = ..." 같은 정확 일치 조회가 불가능하기
 * 때문에, 결정적(같은 입력 -> 항상 같은 값) 해시를 별도로 둬서 그 값으로 조회/UNIQUE
 * 제약을 대신한다. 암호화 키(FIELD_ENCRYPTION_KEY)와 해시 키(PHONE_HASH_SECRET)를
 * 분리해서, 하나가 유출돼도 다른 하나의 목적(복호화 vs 조회)까지 바로 뚫리지 않게 한다.
 *
 * (2026-08-20 관리자 보안 점검 후속 조치 — 1단계: 전화번호부터 암호화)
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

/** 조회/중복확인용 결정적 해시. 같은 정규화된 번호는 항상 같은 값이 나온다. */
export function hashPhone(normalized: string): string {
  return crypto.createHmac("sha256", env.phoneHashSecret).update(normalized).digest("hex");
}

/** 평문(정규화된) 전화번호를 암호화한다. iv + authTag + 암호문을 이어붙여 base64로 저장한다. */
export function encryptPhone(normalized: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** 암호문을 원래 전화번호 문자열로 복호화한다. */
export function decryptPhone(packed: string | null | undefined): string | null {
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

/** 감사로그 등 사람이 보는 화면/기록에는 원문 대신 이 마스킹된 값만 남긴다. */
export function maskPhone(normalized: string | null | undefined): string | null {
  if (!normalized) return null;
  if (normalized.length === 11) return `${normalized.slice(0, 3)}-****-${normalized.slice(7)}`;
  if (normalized.length === 10) return `${normalized.slice(0, 3)}-***-${normalized.slice(6)}`;
  return "****";
}
