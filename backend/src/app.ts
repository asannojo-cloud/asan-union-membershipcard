// 반드시 express보다 먼저 import해야 한다.
// Express 4는 async 라우트 핸들러 안에서 발생한 오류(reject된 Promise)를 자동으로
// next(err)에 넘기지 않는데, Node는 처리되지 않은 Promise rejection이 있으면 기본적으로
// 프로세스 전체를 종료시킨다. 이 때문에 DB 오류 등 흔한 상황에서 서버가 통째로 죽는
// 문제가 있었다 (2026-08-12 Render 배포 중 발견) — 아래 patch로 async 오류가 항상
// errorHandler 미들웨어로 전달되도록 한다.
import "express-async-errors";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import fs from "fs";
import path from "path";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db/pool";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRateLimiter, loginRateLimiter } from "./middleware/rateLimit";
import { memberAuthRouter } from "./modules/auth/member.routes";
import { adminAuthRouter } from "./modules/auth/admin.routes";
import { membersRouter } from "./modules/members/members.routes";
import { excelRouter } from "./modules/excel/excel.routes";
import { auditRouter } from "./modules/audit/audit.routes";

const PgSession = connectPgSimple(session);

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  // 프론트엔드를 같은 서버에서 함께 서빙하므로 실제 요청은 전부 동일 출처(same-origin)이고
  // CORS는 필요 없다. 운영 환경에서는 FRONTEND_ORIGIN 값(공백/따옴표 등 사소한 실수로도
  // Access-Control-Allow-Origin 헤더 설정이 깨져 서버 전체가 죽는 사고가 있었다)에 아예
  // 의존하지 않도록 운영 환경에서는 CORS 미들웨어 자체를 적용하지 않는다 (2026-08-12 수정).
  // 로컬 개발(프론트 :5173 / 백엔드 :4000, 서로 다른 오리진)에서만 필요하므로 개발 환경에서만 켠다.
  if (!env.isProduction) {
    app.use(
      cors({
        origin: env.frontendOrigin,
        credentials: true,
      })
    );
  }
  app.use(express.json({ limit: "1mb" }));

  app.use(
    session({
      store: new PgSession({ pool, tableName: "session", createTableIfMissing: true }),
      name: "agongno.sid",
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: env.isProduction, // 운영 배포(HTTPS)에서는 true로 강제
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 8, // 8시간
      },
    })
  );

  app.use("/api", apiRateLimiter);

  // UptimeRobot 등 외부 핑이 이 엔드포인트를 주기적으로 호출해 Render 웹서비스의
  // 절전(cold start)을 막아주고 있는데, DB 쿼리를 하나도 안 날리다 보니 Neon(무료 tier,
  // 일정 시간 미사용 시 컴퓨트 자동 절전) 쪽은 계속 잠들어 있었다. 그 결과 로그인처럼
  // 실제로 DB에 처음 접근하는 요청에서만 Neon이 깨어나느라 로딩이 오래 걸리는 문제가
  // 있었다(2026-08-19 재신고 확인). 가벼운 SELECT 1을 함께 날려 DB 커넥션도 계속
  // 깨어있게 유지한다. DB 쪽에 일시적 문제가 있어도 서버 자체는 살아있는 것이므로
  // 200으로 응답해 UptimeRobot이 서비스 전체가 죽은 것으로 오인하지 않게 한다.
  app.get("/api/health", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true });
    } catch {
      res.json({ ok: true, db: false });
    }
  });

  app.use("/api/member/login", loginRateLimiter);
  app.use("/api/member", memberAuthRouter);

  app.use("/api/admin/auth/login", loginRateLimiter);
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin/members", membersRouter);
  app.use("/api/admin/excel", excelRouter);
  app.use("/api/admin/audit-logs", auditRouter);

  app.use("/api", notFoundHandler);

  // 운영 배포: 프론트엔드 정적 빌드(frontend/dist)를 같은 서버에서 함께 서빙한다.
  // (별도 서비스로 나누지 않아 CORS·환경변수 관리가 단순해진다)
  if (fs.existsSync(env.frontendDistDir)) {
    app.use(
      express.static(env.frontendDistDir, {
        // index.html은 항상 최신을 받아야 하므로(배포마다 해시가 바뀐 자산을 참조) 캐시하지 않는다.
        index: false,
      })
    );
    app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(path.join(env.frontendDistDir, "index.html"));
    });
  }

  app.use(errorHandler);

  return app;
}
