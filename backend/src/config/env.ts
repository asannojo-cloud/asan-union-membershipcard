import path from "path";
import dotenv from "dotenv";

dotenv.config();

// backend 패키지 루트 (src/config/env.ts 기준 두 단계 위 — dist/config/env.js에서도 동일하게 backend/를 가리킴).
// process.cwd()를 쓰면 "npm run dev --workspace backend"처럼 실행 방식에 따라 기준 디렉터리가 달라져
// storage/tmp 경로가 의도치 않게 backend/storage 등으로 갈라지는 문제가 있었다 (2026-08-12 수정).
const backendRoot = path.resolve(__dirname, "..", "..");

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`환경변수 ${name} 가 설정되지 않았습니다. backend/.env 파일을 확인하세요.`);
  }
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT ?? "4000", 10),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: required("SESSION_SECRET"),
  // 휴대폰번호 필드 암호화(1단계 개인정보 보호 조치, 2026-08-20)에 쓰는 키.
  // FIELD_ENCRYPTION_KEY: AES-256-GCM 암복호화 키(base64, 32바이트).
  // PHONE_HASH_SECRET: 조회/중복확인용 HMAC 해시 키. 둘 다 분실하면 기존에 암호화된
  // 전화번호를 영영 복구할 수 없으니, 운영 환경변수와는 별도로 안전한 곳에 사본을 보관해야 한다.
  fieldEncryptionKey: required("FIELD_ENCRYPTION_KEY"),
  phoneHashSecret: required("PHONE_HASH_SECRET"),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  loginMaxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS ?? "5", 10),
  loginLockMinutes: parseInt(process.env.LOGIN_LOCK_MINUTES ?? "15", 10),
  photoStorageDir: path.resolve(backendRoot, process.env.PHOTO_STORAGE_DIR ?? "./storage/photos"),
  uploadTmpDir: path.resolve(backendRoot, process.env.UPLOAD_TMP_DIR ?? "./tmp/uploads"),
  // Cloudflare R2(S3 호환) 설정 — 4개 값이 전부 있어야 R2를 사용한다. 하나라도 없으면
  // photoStorageDir(로컬 디스크)로 대체 저장한다 (2026-08-12: Render 무료 플랜은 배포마다
  // 로컬 디스크가 초기화되어 사진이 사라지는 문제가 있어 영구 저장소로 전환).
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
  },
  maxExcelSize: parseInt(process.env.MAX_EXCEL_SIZE ?? "10485760", 10),
  maxZipSize: parseInt(process.env.MAX_ZIP_SIZE ?? "209715200", 10),
  // 스마트폰 카메라 사진은 5MB를 넘는 경우가 흔해서(2026-08-12 사진 일괄 업로드 중 확인)
  // 기본값을 15MB로 올렸다. 어차피 서버에서 sharp로 정규화/압축 후 저장한다.
  maxPhotoSize: parseInt(process.env.MAX_PHOTO_SIZE ?? "15728640", 10),
  // 운영 배포 시 백엔드가 프론트엔드 정적 빌드도 함께 서빙한다 (별도 서비스/CORS 불필요).
  frontendDistDir: path.resolve(backendRoot, "..", "frontend", "dist"),
};
