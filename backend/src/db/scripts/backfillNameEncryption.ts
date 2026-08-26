import { pool } from "../pool";
import { encryptName, decryptName } from "../../utils/nameCrypto";

/**
 * members.name(평문) 값을 name_enc(암호문)로 채워 넣는 1회성 백필 스크립트.
 * phone/birth_date 백필과 동일하게 idempotent하고, 저장 전 왕복 검증을 거친다.
 *
 * 실행: npx tsx src/db/scripts/backfillNameEncryption.ts
 */
async function backfill() {
  const { rows } = await pool.query(
    `SELECT id, member_id, name FROM members WHERE name IS NOT NULL AND name_enc IS NULL ORDER BY id`
  );

  console.log(`[backfill] 대상 ${rows.length}건`);
  let done = 0;

  for (const row of rows) {
    const enc = encryptName(row.name);

    const roundTrip = decryptName(enc);
    if (roundTrip !== row.name) {
      throw new Error(
        `[backfill] 회원 ${row.member_id}(id=${row.id}) 암복호화 왕복 검증 실패 — 중단합니다.`
      );
    }

    await pool.query(`UPDATE members SET name_enc = $1 WHERE id = $2`, [enc, row.id]);
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
