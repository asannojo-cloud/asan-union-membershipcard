-- 개인정보 보호 2단계: 생년월일 암호화.
-- 전화번호와 달리 조회/중복확인이 필요 없으므로 해시 컬럼은 두지 않는다.
-- 기존 birth_date(평문 DATE) 컬럼은 안전 확인될 때까지 당분간 그대로 둔다.

ALTER TABLE members ADD COLUMN birth_date_enc TEXT;
