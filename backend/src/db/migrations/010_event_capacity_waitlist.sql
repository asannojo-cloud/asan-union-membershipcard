-- 이벤트별 신청 정원(capacity)을 설정할 수 있게 하고, 정원을 넘겨 신청한 사람은
-- 대기자(waitlisted)로 접수되도록 한다. capacity가 NULL이면 정원 제한이 없다.
ALTER TABLE union_events ADD COLUMN capacity INTEGER;
ALTER TABLE union_event_applications ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'confirmed';
-- 'confirmed'(신청 확정) | 'waitlisted'(대기자)
