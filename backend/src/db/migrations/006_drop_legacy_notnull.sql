-- name_enc/birth_date_enc 도입 이후에도 예전 평문 컬럼(name, birth_date)에
-- NOT NULL 제약이 남아있어, 새 회원 등록 시(암호화 컬럼만 채우고 평문 컬럼은
-- 비워둠) INSERT가 거부되는 버그가 있었다 (2026-08-28 실제 신규등록 오류로 발견).
-- 기존 데이터는 그대로 두고, 제약만 완화한다.

ALTER TABLE members ALTER COLUMN name DROP NOT NULL;
ALTER TABLE members ALTER COLUMN birth_date DROP NOT NULL;
