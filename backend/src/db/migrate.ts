import fs from "fs";
import path from "path";
import { pool } from "./pool";

/**
 * 매우 단순한 순차 마이그레이션 러너.
 * migrations/ 폴더의 *.sql 파일을 파일명 순서대로 실행하고,
 * schema_migrations 테이블에 적용 이력을 기록한다.
 *
 * Render 무료 웹서비스는 Shell 탭이 유료 플랜 전용이라(2026-08-31 확인) 배포 후 수동으로
 * `npm run migrate`를 실행할 방법이 없다. 그래서 package.json의 start 스크립트가 서버를
 * 띄우기 전에 이 스크립트를 매번(re)deploy마다 자동 실행한다 — 이미 적용된 파일은
 * schema_migrations를 보고 건너뛰므로 반복 실행해도 안전하다. 다만 마이그레이션이
 * 실패하더라도(예: DB 일시 접속 불가) 서비스 전체가 못 뜨는 일이 없도록 start 스크립트는
 * `;`로 다음 명령을 이어서 실행한다(`&&`가 아님) — 실패는 로그에는 남지만 서버는 뜬다.
 */
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const dir = path.join(__dirname, "migrations");
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (rows.length > 0) {
        console.log(`[migrate] 건너뜀 (이미 적용됨): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), "utf-8");
      console.log(`[migrate] 적용 중: ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[migrate] 완료: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log("[migrate] 모든 마이그레이션 적용 완료");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("[migrate] 실패:", err);
  process.exit(1);
});
