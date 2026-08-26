import { pool } from "../../db/pool";
import { parsePhone } from "../../utils/phoneUtils";
import { decryptPhone, hashPhone } from "../../utils/phoneCrypto";
import { decryptBirthDate } from "../../utils/dateCrypto";

export interface MemberSearchParams {
  query?: string;
  status?: "active" | "inactive";
  hasPhoto?: boolean;
  page: number;
  pageSize: number;
}

export async function searchMembers(params: MemberSearchParams) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.query) {
    values.push(`%${params.query}%`);
    const textCond = `(member_id ILIKE $${values.length} OR name ILIKE $${values.length})`;
    // 전화번호는 암호화되어 있어 부분(ILIKE) 검색은 더 이상 불가능하다. 검색어가
    // 전화번호 전체 형식으로 보이면, 해시로 정확히 일치하는 건만 추가로 매칭해준다
    // (2026-08-20 전화번호 암호화 1단계 — "010-1234" 같은 일부 검색은 이제 안 됨).
    const phoneParsed = parsePhone(params.query);
    if (phoneParsed.ok) {
      values.push(hashPhone(phoneParsed.normalized));
      conditions.push(`(${textCond} OR phone_hash = $${values.length})`);
    } else {
      conditions.push(textCond);
    }
  }
  if (params.status) {
    values.push(params.status);
    conditions.push(`status = $${values.length}`);
  }
  if (params.hasPhoto === true) {
    conditions.push(`photo_path IS NOT NULL`);
  } else if (params.hasPhoto === false) {
    conditions.push(`photo_path IS NULL`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (params.page - 1) * params.pageSize;

  // hasPhoto 조건은 바인딩 값 없이 리터럴(photo_path IS NULL 등)로만 들어가므로
  // "조건 개수 == 바인딩 값 개수"가 더 이상 성립하지 않는다. 개수 대신 여기서 실제
  // WHERE절에 쓰인 값의 개수를 스냅샷해서 count 쿼리에 정확히 그만큼만 넘긴다
  // (안 그러면 플레이스홀더 수와 안 맞아 쿼리 자체가 오류난다, 2026-08-12 발견).
  const whereValueCount = values.length;

  values.push(params.pageSize);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  // member_id는 "2026-1", "2026-10", "2026-2"처럼 "연도-일련번호" 형태라 문자열로
  // 그냥 정렬하면 "2026-10"이 "2026-2"보다 앞에 오는 등 순서가 뒤죽박죽으로 보인다
  // (2026-08-14 회원관리 화면에서 순서가 이상하다는 지적으로 발견). 연도/일련번호를
  // 숫자로 쪼개서 정렬하고, 그 형식이 아닌 회원번호는 맨 뒤로 보낸다.
  const { rows } = await pool.query(
    `SELECT member_id, name, status, issue_date, phone_enc, (photo_path IS NOT NULL) AS has_photo
     FROM members
     ${where}
     ORDER BY
       (member_id ~ '^[0-9]+-[0-9]+$') DESC,
       CASE WHEN member_id ~ '^[0-9]+-[0-9]+$' THEN split_part(member_id, '-', 1)::int END,
       CASE WHEN member_id ~ '^[0-9]+-[0-9]+$' THEN split_part(member_id, '-', 2)::int END,
       member_id
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values
  );

  const countValues = values.slice(0, whereValueCount);
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM members ${where}`,
    countValues
  );

  // API 응답 형태(phone 필드)는 기존과 동일하게 유지하도록, DB 접근 계층에서만 복호화한다.
  const decryptedRows = rows.map(({ phone_enc, ...rest }) => ({ ...rest, phone: decryptPhone(phone_enc) }));

  return { rows: decryptedRows, total: countRows[0]?.total ?? 0 };
}

export async function getMemberDetail(memberId: string) {
  const { rows } = await pool.query(
    `SELECT member_id, name, birth_date_enc, issue_date, status, phone_enc, created_at, updated_at,
            (photo_path IS NOT NULL) AS has_photo,
            (NOT must_reset_password AND password_hash IS NOT NULL) AS has_pin
     FROM members WHERE member_id = $1`,
    [memberId]
  );
  const { phone_enc, birth_date_enc, ...member } = rows[0] ?? {};
  if (!rows[0]) return null;

  const { rows: lastChange } = await pool.query(
    `SELECT action, old_value, new_value, created_at
     FROM audit_logs WHERE member_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [memberId]
  );

  return {
    ...member,
    phone: decryptPhone(phone_enc),
    birth_date: decryptBirthDate(birth_date_enc),
    lastChange: lastChange[0] ?? null,
  };
}

/**
 * 회원번호 권장 양식 "발급연도-일련번호" (예: 2026-1) 기준으로
 * 해당 연도의 다음 일련번호를 제안한다. 강제 규칙은 아니며 신규 등록 화면의 기본값으로만 사용된다.
 */
export async function suggestNextMemberId(year: number): Promise<string> {
  const { rows } = await pool.query(
    `SELECT member_id FROM members WHERE member_id ~ ('^' || $1::text || '-[0-9]+$')`,
    [String(year)]
  );
  let maxSerial = 0;
  for (const row of rows) {
    const serial = parseInt(String(row.member_id).split("-")[1], 10);
    if (Number.isFinite(serial) && serial > maxSerial) maxSerial = serial;
  }
  return `${year}-${maxSerial + 1}`;
}

export async function getDashboardStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive,
      COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_recent
    FROM members
  `);
  const { rows: batches } = await pool.query(`
    SELECT id, file_name, uploaded_at, status, total_rows, new_count, updated_count, inactive_count, error_count
    FROM upload_batches ORDER BY uploaded_at DESC LIMIT 5
  `);
  const { rows: changes } = await pool.query(`
    SELECT member_id, action, created_at FROM audit_logs
    WHERE action NOT IN ('member_login_success','member_login_fail','admin_login_success','admin_login_fail')
    ORDER BY created_at DESC LIMIT 10
  `);
  return { counts: rows[0], recentBatches: batches, recentChanges: changes };
}
