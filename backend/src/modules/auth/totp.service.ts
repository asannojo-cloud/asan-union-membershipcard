import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

/**
 * 관리자 2단계 인증(TOTP, 구글 OTP/Authy 등 호환) 헬퍼.
 * admins.totp_secret / totp_enabled 컬럼은 이미 스키마에 있었지만(001_init.sql)
 * 실제로 로그인 절차에서 검증되지 않고 있던 미구현 상태였다 — 여기서 실제로 붙인다.
 */

const ISSUER = "아공노 관리자";

/** 새 비밀키(Base32) 생성 — 설정을 시작할 때마다 새로 발급한다. */
export function createTotpSecret(): string {
  return generateSecret();
}

/** 인증앱(Google Authenticator 등)에서 QR로 스캔할 otpauth:// URI. */
export function totpKeyUri(accountLabel: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: accountLabel, secret });
}

/** 위 URI를 QR 이미지(data URL)로 렌더링한다. */
export async function totpQrCodeDataUrl(accountLabel: string, secret: string): Promise<string> {
  const uri = totpKeyUri(accountLabel, secret);
  return QRCode.toDataURL(uri);
}

/** 6자리 코드 검증. 시계 오차를 고려해 앞뒤 1스텝(±30초)까지 허용한다. */
export async function verifyTotpToken(token: string, secret: string | null): Promise<boolean> {
  if (!secret || !/^\d{6}$/.test(token)) return false;
  const result = await verify({ secret, token, epochTolerance: 30 });
  return result.valid;
}
