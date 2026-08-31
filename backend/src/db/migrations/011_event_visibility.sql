-- 관리자가 이벤트를 회원 화면에 표출할지 여부를 따로 제어할 수 있게 한다.
-- (신청 마감/재오픈과는 별개 — 마감된 행사도 안내 목적으로 계속 보여줄 수 있고,
--  반대로 아직 준비 중인 이벤트는 표출을 꺼서 회원 화면에서 완전히 숨길 수 있다.)
ALTER TABLE union_events ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT true;

-- 회원 화면에 보여지는 순서(낮을수록 먼저 표시). 비워두면(NULL) 최신 등록순으로 밀린다.
ALTER TABLE union_events ADD COLUMN display_order INTEGER;
