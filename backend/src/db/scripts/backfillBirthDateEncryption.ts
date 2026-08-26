import { pool } from "../pool";
import { encryptBirthDate, decryptBirthDate } from "../../utils/dateCrypto";

/**
 * members.birth_date(평문 DATE) 값을 birth_date_enc(암호문)로 채워 넣는 1회성 백필
 * 스크립트. phoneEncryption 백필과 동일하게 idempotent(이미 채워진 행은 건너뜀)하고,
 * 저장 전 왕복(암호화 -> 복호화) 검증을 거친다.
 *
 * 실행: npx tsx src/db/scripts/backfillBirthDateEncryption.ts
 */
async function backfill() {
  const { rows } = await pool.query(
    `SELECT id, member_id, birth_date::text AS birth_date
     FROM members WHERE birth_date IS NOT NULL AND birth_date_enc IS NULL ORDER BY id`
  );

  console.log(`[backfill] 대상 ${rows.length}건`);
  let done = 0;

  for (const row of rows) {
    const enc = encryptBirthDate(row.birth_date);

    const roundTrip = decryptBirthDate(enc);
    if (roundTrip !== row.birth_date) {
      throw new Error(
        `[backfill] 회원 ${row.member_id}(id=${row.id}) 암복호화 왕복 검증 실패 — 중단합니다.`
      );
    }

    await pool.query(`UPDATE members SET birth_date_enc = $1 WHERE id = $2`, [enc, row.id]);
    done++;
    if (done % 200 === 0) console.log(`[backfill] 진행 ${done}/${rows.length}`);
  }

  console.log(`[backfill] 완료 — ${done}건 처리`);
}

backfill()
  .catch((err) => {
    console.error("[backfill] 실패:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
