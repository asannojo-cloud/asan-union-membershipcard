import { pool } from "../pool";
import { encryptPhone, decryptPhone, hashPhone } from "../../utils/phoneCrypto";

/**
 * 기존에 평문으로 저장돼 있던 members.phone 값을 phone_enc(암호문)/phone_hash(조회용
 * 해시)로 채워 넣는 1회성 백필 스크립트. 이미 채워진 행은 건너뛰므로 여러 번 실행해도
 * 안전하다(idempotent). 각 행마다 암호화 직후 다시 복호화해서 원본과 일치하는지
 * 확인한 뒤에만 저장하고, 하나라도 실패하면 즉시 중단한다 — 1888명 규모 운영 데이터라
 * "일부만 깨진 채로 계속 진행" 되는 상황을 피하기 위함이다.
 *
 * 실행: npx tsx src/db/scripts/backfillPhoneEncryption.ts
 */
async function backfill() {
  const { rows } = await pool.query(
    `SELECT id, member_id, phone FROM members WHERE phone IS NOT NULL AND phone_enc IS NULL ORDER BY id`
  );

  console.log(`[backfill] 대상 ${rows.length}건`);
  let done = 0;

  for (const row of rows) {
    const enc = encryptPhone(row.phone);
    const hash = hashPhone(row.phone);

    // 저장 전에 자체 검증: 방금 만든 암호문을 다시 복호화해서 원본과 같은지 확인.
    const roundTrip = decryptPhone(enc);
    if (roundTrip !== row.phone) {
      throw new Error(
        `[backfill] 회원 ${row.member_id}(id=${row.id}) 암복호화 왕복 검증 실패 — 중단합니다.`
      );
    }

    await pool.query(`UPDATE members SET phone_enc = $1, phone_hash = $2 WHERE id = $3`, [
      enc,
      hash,
      row.id,
    ]);
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
