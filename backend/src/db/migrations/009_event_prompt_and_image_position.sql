-- 조합사업 신청 시 회원에게 보여줄 질문 문구(관리자가 이벤트별로 직접 입력/선택)와
-- 전단지 이미지가 회원 화면(4:3 크롭)에서 잘리는 위치를 관리자가 조절할 수 있도록 컬럼 추가.
ALTER TABLE union_events ADD COLUMN application_prompt TEXT NOT NULL DEFAULT '신청사유 또는 아공노에 바라는 점을 남겨주세요.';
ALTER TABLE union_events ADD COLUMN image_position_y SMALLINT NOT NULL DEFAULT 50;
