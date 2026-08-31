-- 조합사업 신청 시 사유(아공노에 바라는 점 등) 텍스트를 함께 받는다.
ALTER TABLE union_event_applications ADD COLUMN comment TEXT;
