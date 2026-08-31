import { Pool, types } from "pg";
import { env } from "../config/env";

// PostgreSQL DATE 타입(OID 1082)을 JS Date 객체로 자동 변환하면 서버 타임존에 따라
// 날짜가 하루 밀리는 문제가 생긴다. "YYYY-MM-DD" 문자열 그대로 사용한다.
types.setTypeParser(1082, (val: string) => val);

// BIGINT/BIGSERIAL(OID 20)은 JS number의 안전 정수 범위(2^53)를 넘을 수 있어서 pg가
// 기본적으로 문자열로 반환한다. 이 앱의 id는 그 정도로 커질 일이 없는데, 프론트엔드
// 코드가 id를 number로 가정(예: typeof id === "number")하면 문자열("6")이 내려와서
// 조용히 분기를 타지 않는 문제가 생긴다(2026-08-31, 조합사업 이벤트 수정 저장 안 되던 원인).
// 다른 BIGSERIAL 컬럼(members.id 등)에서도 같은 문제가 재발하지 않도록 전역으로 숫자 변환한다.
types.setTypeParser(20, (val: string) => parseInt(val, 10));

export const pool = new Pool({
  connectionString: env.databaseUrl,
  // Render 등 대부분의 매니지드 PostgreSQL은 SSL 연결을 요구한다.
  // rejectUnauthorized:false는 Render가 자체 발급한 인증서 체인을 로컬에서 검증할 수 없기 때문
  // (Render 공식 가이드에서 권장하는 설정) — 로컬 개발(NODE_ENV=development)에서는 비활성화.
  ssl: env.isProduction ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[db] 예기치 않은 유휴 클라이언트 오류", err);
});

// Neon 등 일부 매니지드 PostgreSQL은 롤(role) 기본 search_path가 빈 값으로 설정되어 있을 수 있고,
// PgBouncer(pooled 연결) 특성상 ALTER ROLE로 바꿔도 이미 열려있던 커넥션에는 즉시 반영되지 않는다
// (2026-08-18 Neon 이전 중 확인). 스키마 명시 없이 테이블명을 그대로 쓰는 기존 쿼리들이 항상
// 정상 동작하도록, 풀이 새 물리 커넥션을 맺을 때마다 명시적으로 search_path를 지정해둔다.
pool.on("connect", (client) => {
  client.query("SET search_path TO public").catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[db] search_path 설정 실패", err);
  });
});
