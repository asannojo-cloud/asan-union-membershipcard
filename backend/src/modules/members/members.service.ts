import { pool } from "../../db/pool";
import { parsePhone } from "../../utils/phoneUtils";
import { decryptPhone, hashPhone } from "../../utils/phoneCrypto";
import { decryptBirthDate } from "../../utils/dateCrypto";
import { decryptName } from "../../utils/nameCrypto";

// member_id는 "2026-1", "2026-10", "2026-2"처럼 "연도-일련번호" 형태라 문자열로
// 그냥 정렬하면 "2026-10"이 "2026-2"보다 앞에 오는 등 순서가 뒤죽박죽으로 보인다
// (2026-08-14 발견). 연도/일련번호를 숫자로 비교하고, 그 형식이 아닌 값은 맨 뒤로 보낸다.
// 예전에는 이 정렬을 SQL ORDER BY로 했지만, 이름 암호화(2026-08-20 3단계)로 검색/정렬을
// 애플리케이션 메모리에서 처리하게 되면서 이 비교 함수로 옮겼다.
function compareMemberId(a: string, b: string): number {
  const ma = a.match(/^(\d+)-(\d+)$/);
  const mb = b.match(/^(\d+)-(\d+)$/);
  if (ma && !mb) return -1;
  if (!ma && mb) return 1;
  if (ma && mb) {
    const yearDiff = parseInt(ma[1], 10) - parseInt(mb[1], 10);
    if (yearDiff !== 0) return yearDiff;
    const serialDiff = parseInt(ma[2], 10) - parseInt(mb[2], 10);
    if (serialDiff !== 0) return serialDiff;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

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

  // status/hasPhoto는 평문 컬럼이라 그대로 SQL로 거른다. 이름/전화번호는 암호화되어
  // 있어 DB에서 직접 부분검색을 할 수 없으므로, 나머지(검색어 매칭·정렬·페이지네이션)는
  // 전체를 복호화한 뒤 서버 메모리에서 처리한다 — 회원 수가 2000명 이하 규모라
  // 성능 문제는 없다 (2026-08-20 이름 암호화 3단계로 검색 방식 변경).
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

  const { rows } = await pool.query(
    `SELECT member_id, name_enc, status, issue_date, phone_enc, phone_hash, (photo_path IS NOT NULL) AS has_photo
     FROM members ${where}`,
    values
  );

  let decrypted = rows.map(({ name_enc, phone_enc, ...rest }) => ({
    ...rest,
    name: decryptName(name_enc),
    phone: decryptPhone(phone_enc),
  }));

  if (params.query) {
    const q = params.query.trim();
    const qLower = q.toLowerCase();
    // 전화번호 부분검색은 암호화 이후 더 이상 불가능하다. 검색어가 전화번호 전체
    // 형식으로 보이면, 해시로 정확히 일치하는 건만 추가로 매칭해준다
    // (2026-08-20 전화번호 암호화 1단계 — "010-1234" 같은 일부 검색은 이제 안 됨).
    const phoneParsed = parsePhone(q);
    const queryPhoneHash = phoneParsed.ok ? hashPhone(phoneParsed.normalized) : null;
    decrypted = decrypted.filter(
      (r) =>
        r.member_id.toLowerCase().includes(qLower) ||
        (r.name ?? "").toLowerCase().includes(qLower) ||
        (queryPhoneHash !== null && r.phone_hash === queryPhoneHash)
    );
  }

  decrypted.sort((a, b) => compareMemberId(a.member_id, b.member_id));

  const total = decrypted.length;
  const offset = (params.page - 1) * params.pageSize;
  const pageRows = decrypted.slice(offset, offset + params.pageSize).map(({ phone_hash, ...rest }) => rest);

  return { rows: pageRows, total };
}

export async function getMemberDetail(memberId: string) {
  const { rows } = await pool.query(
    `SELECT member_id, name_enc, birth_date_enc, issue_date, status, phone_enc, created_at, updated_at,
            (photo_path IS NOT NULL) AS has_photo,
            (NOT must_reset_password AND password_hash IS NOT NULL) AS has_pin
     FROM members WHERE member_id = $1`,
    [memberId]
  );
  const { phone_enc, birth_date_enc, name_enc, ...member } = rows[0] ?? {};
  if (!rows[0]) return null;

  const { rows: lastChange } = await pool.query(
    `SELECT action, old_value, new_value, created_at
     FROM audit_logs WHERE member_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [memberId]
  );

  return {
    ...member,
    name: decryptName(name_enc),
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
