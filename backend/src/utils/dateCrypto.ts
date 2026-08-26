import { encryptField, decryptField } from "./fieldCrypto";

/**
 * 생년월일 필드 암호화 (2단계, 2026-08-20). 전화번호와 달리 정확 일치 조회나
 * 중복확인이 필요 없어서 별도 해시 컬럼 없이 암호문(birth_date_enc)만 둔다.
 */

/** ISO 날짜 문자열("YYYY-MM-DD")을 암호화한다. */
export function encryptBirthDate(iso: string): string {
  return encryptField(iso);
}

/** 암호문을 원래 ISO 날짜 문자열로 복호화한다. */
export function decryptBirthDate(packed: string | null | undefined): string | null {
  return decryptField(packed);
}

/** 감사로그 등에는 연도만 남기고 월/일은 가린다. */
export function maskBirthDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return `${iso.slice(0, 4)}-**-**`;
}
