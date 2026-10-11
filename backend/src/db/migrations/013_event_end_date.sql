-- 이벤트 종료일. 이 날짜(한국시간 기준, 당일 포함)가 지나면 회원 화면에서 자동으로 숨긴다.
-- 비워두면(NULL) 자동 숨김 없이 기존처럼 관리자가 직접 표출/마감을 제어한다.
ALTER TABLE union_events ADD COLUMN end_date DATE;
