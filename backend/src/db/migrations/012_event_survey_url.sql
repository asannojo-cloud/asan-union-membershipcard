-- 이벤트별로 설문조사(구글폼 등) 링크를 연결할 수 있게 한다. 비어있으면 회원 화면에 노출 안 함.
ALTER TABLE union_events ADD COLUMN survey_url TEXT;
