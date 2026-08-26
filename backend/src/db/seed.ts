import bcrypt from "bcrypt";
import { pool } from "./pool";
import { encryptPhone, hashPhone } from "../utils/phoneCrypto";
import { encryptBirthDate } from "../utils/dateCrypto";

/**
 * 개발/테스트용 시드 데이터.
 * PRD 39번 원칙: 실제 조합원 개인정보를 사용하지 않고 가상 데이터만 사용한다.
 *
 * 회원 로그인은 "이름 + 휴대폰번호" 방식이다 (2026-08-12 변경).
 */
async function seed() {
  const client = await pool.connect();
  try {
    // 관리자 계정 (개발용 기본 비밀번호 — 운영 배포 전 반드시 변경)
    const adminPasswordHash = await bcrypt.hash("Admin!2026Dev", 12);
    await client.query(
      `INSERT INTO admins (username, password_hash, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING`,
      ["admin", adminPasswordHash, "테스트관리자"]
    );

    // 가상 회원 데이터. 회원번호는 권장 양식 "발급연도-일련번호"(예: 2026-1)를 따른다.
    // 휴대폰번호도 가상 번호(010-0000-000X)만 사용한다.
    const members = [
      ["2026-1", "홍길동", "1985-03-15", "2026-08-11", "01000000001"],
      ["2026-2", "김철수", "1987-04-20", "2026-08-11", "01000000002"],
      ["2026-3", "이영희", "1990-11-02", "2026-08-11", "01000000003"],
    ];

    for (const [memberId, name, birthDate, issueDate, phone] of members) {
      await client.query(
        `INSERT INTO members (member_id, name, birth_date_enc, issue_date, phone_enc, phone_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (member_id) DO NOTHING`,
        [memberId, name, encryptBirthDate(birthDate), issueDate, encryptPhone(phone), hashPhone(phone)]
      );
    }

    console.log("[seed] 완료 — 관리자: admin / Admin!2026Dev (개발용, 배포 전 변경 필수)");
    console.log("[seed] 완료 — 회원 예시: 이름 '홍길동' / 휴대폰번호 010-0000-0001 (가상 테스트 데이터)");
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("[seed] 실패:", err);
  process.exit(1);
});
