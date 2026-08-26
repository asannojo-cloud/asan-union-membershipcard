import { encryptField, decryptField } from "./fieldCrypto";

/**
 * 이름 필드 암호화 (3단계, 2026-08-20). 로그인은 phone_hash로 조회한 단일 행에
 * 대해서만 이름을 비교하므로 별도 해시가 필요 없다. 반면 관리자 화면의 부분검색은
 * SQL로 직접 할 수 없어, members.service.ts에서 전체를 복호화한 뒤 메모리에서
 * 필터링한다(회원 수가 2000명 이하 규모라 성능 문제 없음).
 */

export function encryptName(name: string): string {
  return encryptField(name);
}

export function decryptName(packed: string | null | undefined): string | null {
  return decryptField(packed);
}

/** 감사로그 등에는 첫 글자만 남기고 나머지는 가린다 (예: "홍길동" -> "홍**"). */
export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name.length <= 1) return "*";
  return name[0] + "*".repeat(name.length - 1);
}
