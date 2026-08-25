-- 개인정보 보호 강화 1단계: 휴대폰번호 암호화.
-- 기존 phone(평문) 컬럼은 안전하게 전환됐는지 확인될 때까지 당분간 그대로 두고,
-- 애플리케이션은 이제부터 phone_enc(암호문)/phone_hash(조회용 해시)만 읽고 쓴다.
-- 실제 값 채우기는 백필 스크립트(backend/src/db/scripts/backfillPhoneEncryption.ts)가 담당한다.

ALTER TABLE members ADD COLUMN phone_enc TEXT;
ALTER TABLE members ADD COLUMN phone_hash TEXT;

CREATE UNIQUE INDEX idx_members_phone_hash_unique ON members (phone_hash) WHERE phone_hash IS NOT NULL;
