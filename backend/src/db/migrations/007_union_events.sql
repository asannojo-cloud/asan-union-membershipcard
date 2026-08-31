-- 조합사업(이벤트/행사) 안내 + 신청 기능.
-- 관리자가 이벤트(제목/안내내용/전단지 이미지)를 등록하면, 조합원이 앱에서 보고
-- "신청하기"를 누르는 즉시(로그인된 본인 정보로) 신청이 기록되고, 관리자가
-- 이벤트별 신청자 명단을 확인할 수 있다.

CREATE TABLE union_events (
  id            BIGSERIAL PRIMARY KEY,
  title         VARCHAR(100) NOT NULL,
  description   TEXT,
  image_path    TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'open',  -- 'open'(신청가능) | 'closed'(마감)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_union_events_updated_at
  BEFORE UPDATE ON union_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE union_event_applications (
  id          BIGSERIAL PRIMARY KEY,
  event_id    BIGINT NOT NULL REFERENCES union_events(id) ON DELETE CASCADE,
  member_id   BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)  -- 같은 회원이 같은 이벤트에 중복 신청하지 못하게 함
);
CREATE INDEX idx_union_event_applications_event ON union_event_applications (event_id);
