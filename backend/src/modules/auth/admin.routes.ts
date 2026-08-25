import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool";
import { adminGuard } from "../../middleware/guards";
import { isLocked, registerFailedAttempt, resetFailedAttempts, verifyPassword } from "./auth.service";
import { createTotpSecret, totpQrCodeDataUrl, verifyTotpToken } from "./totp.service";
import { recordAudit } from "../audit/audit.service";

export const adminAuthRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
  totpCode: z.string().optional(), // 2단계 인증이 켜져 있는 계정만 필요
});

/**
 * 관리자 로그인: 아이디 + 비밀번호 (+ 2단계 인증이 켜져 있으면 6자리 코드까지).
 * 프론트는 2단계로 나눠 요청한다 — 조합원 로그인과 동일한 패턴:
 *   1) {username, password}만 보내면, 비밀번호가 맞아도 totp_enabled면 로그인시키지
 *      않고 needsTotp:true만 돌려준다 (세션은 아직 생성 안 함).
 *   2) totpCode까지 함께 보내면 검증 후 바로 로그인 완료.
 */
adminAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "아이디와 비밀번호를 입력해주세요." });
  }
  const { username, password, totpCode } = parsed.data;

  const { rows } = await pool.query(
    `SELECT id, username, name, password_hash, failed_login_count, locked_until, totp_secret, totp_enabled
     FROM admins WHERE username = $1`,
    [username]
  );
  const admin = rows[0];
  const genericError = { error: "아이디 또는 비밀번호가 올바르지 않습니다." };

  if (!admin) return res.status(401).json(genericError);

  if (isLocked(admin)) {
    return res.status(423).json({ error: "로그인 시도 초과로 잠시 잠겼습니다. 잠시 후 다시 시도해주세요." });
  }

  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) {
    await registerFailedAttempt("admins", admin.id, admin.failed_login_count);
    await recordAudit({ adminId: admin.id, action: "admin_login_fail" });
    return res.status(401).json(genericError);
  }

  if (admin.totp_enabled) {
    if (!totpCode) {
      return res.json({ ok: false, needsTotp: true });
    }
    const totpOk = await verifyTotpToken(totpCode, admin.totp_secret);
    if (!totpOk) {
      await registerFailedAttempt("admins", admin.id, admin.failed_login_count);
      await recordAudit({ adminId: admin.id, action: "admin_login_fail_totp" });
      return res.status(401).json({ error: "인증번호가 올바르지 않습니다." });
    }
  }

  await resetFailedAttempts("admins", admin.id);
  await recordAudit({ adminId: admin.id, action: "admin_login_success" });

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "로그인 처리 중 오류가 발생했습니다." });
    req.session.auth = { role: "admin", id: admin.id };
    res.json({ ok: true, name: admin.name });
  });
});

adminAuthRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("agongno.sid");
    res.json({ ok: true });
  });
});

adminAuthRouter.get("/me", adminGuard, async (req, res) => {
  const { rows } = await pool.query(`SELECT username, name, totp_enabled FROM admins WHERE id = $1`, [
    req.session.auth!.id,
  ]);
  const admin = rows[0];
  if (!admin) return res.status(401).json({ error: "세션이 만료되었습니다." });
  res.json({ username: admin.username, name: admin.name, totpEnabled: admin.totp_enabled });
});

/**
 * 2단계 인증 설정 시작 — 새 비밀키를 발급해 저장(아직 totp_enabled는 false)하고,
 * 인증앱에서 스캔할 QR 코드를 돌려준다. 이미 켜져 있으면 먼저 끄도록 안내한다
 * (탈취된 세션이 조용히 새 비밀키로 바꿔치기 못하게 하는 방어).
 */
adminAuthRouter.post("/totp/setup", adminGuard, async (req, res) => {
  const { rows } = await pool.query(`SELECT username, totp_enabled FROM admins WHERE id = $1`, [
    req.session.auth!.id,
  ]);
  const admin = rows[0];
  if (!admin) return res.status(401).json({ error: "세션이 만료되었습니다." });
  if (admin.totp_enabled) {
    return res.status(400).json({ error: "이미 2단계 인증이 켜져 있습니다. 먼저 비활성화해주세요." });
  }

  const secret = createTotpSecret();
  await pool.query(`UPDATE admins SET totp_secret = $1 WHERE id = $2`, [secret, req.session.auth!.id]);

  const qrCodeDataUrl = await totpQrCodeDataUrl(admin.username, secret);
  res.json({ secret, qrCodeDataUrl });
});

/** 설정 마무리 — 인증앱에 뜬 6자리 코드로 정상 등록됐는지 확인 후 활성화. */
const totpCodeSchema = z.object({ code: z.string().min(1).max(10) });

adminAuthRouter.post("/totp/verify-setup", adminGuard, async (req, res) => {
  const parsed = totpCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "인증번호를 입력해주세요." });

  const { rows } = await pool.query(`SELECT totp_secret, totp_enabled FROM admins WHERE id = $1`, [
    req.session.auth!.id,
  ]);
  const admin = rows[0];
  if (!admin) return res.status(401).json({ error: "세션이 만료되었습니다." });
  if (admin.totp_enabled) return res.status(400).json({ error: "이미 활성화되어 있습니다." });

  const valid = await verifyTotpToken(parsed.data.code, admin.totp_secret);
  if (!valid) return res.status(400).json({ error: "인증번호가 올바르지 않습니다. 다시 확인해주세요." });

  await pool.query(`UPDATE admins SET totp_enabled = true WHERE id = $1`, [req.session.auth!.id]);
  await recordAudit({ adminId: req.session.auth!.id, action: "admin_totp_enabled" });
  res.json({ ok: true });
});

/** 비활성화 — 탈취된 세션이 마음대로 끄지 못하도록 현재 6자리 코드를 다시 확인한다. */
adminAuthRouter.post("/totp/disable", adminGuard, async (req, res) => {
  const parsed = totpCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "인증번호를 입력해주세요." });

  const { rows } = await pool.query(`SELECT totp_secret, totp_enabled FROM admins WHERE id = $1`, [
    req.session.auth!.id,
  ]);
  const admin = rows[0];
  if (!admin) return res.status(401).json({ error: "세션이 만료되었습니다." });
  if (!admin.totp_enabled) return res.status(400).json({ error: "이미 꺼져 있습니다." });

  const valid = await verifyTotpToken(parsed.data.code, admin.totp_secret);
  if (!valid) return res.status(400).json({ error: "인증번호가 올바르지 않습니다." });

  await pool.query(`UPDATE admins SET totp_enabled = false, totp_secret = NULL WHERE id = $1`, [
    req.session.auth!.id,
  ]);
  await recordAudit({ adminId: req.session.auth!.id, action: "admin_totp_disabled" });
  res.json({ ok: true });
});
