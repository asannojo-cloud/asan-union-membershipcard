import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool";
import { memberGuard } from "../../middleware/guards";
import { streamPhotoOrDefault } from "../photos/photos.service";
import { recordAudit } from "../audit/audit.service";
import { parsePhone } from "../../utils/phoneUtils";
import { hashPhone } from "../../utils/phoneCrypto";
import { decryptBirthDate } from "../../utils/dateCrypto";
import { decryptName } from "../../utils/nameCrypto";
import { isLocked, registerFailedAttempt, resetFailedAttempts, verifyPassword, hashPassword } from "./auth.service";

export const memberAuthRouter = Router();

const PIN_REGEX = /^\d{4}$/;

const loginSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요.").max(50),
  phone: z.string().min(1, "휴대폰번호를 입력해주세요.").max(30),
  pin: z.string().optional(), // 기존에 설정한 4자리 비밀번호 확인용
  newPin: z.string().optional(), // 최초 설정(또는 관리자 초기화 후 재설정)용
  newPinConfirm: z.string().optional(),
});

/**
 * 회원 로그인: 이름 + 휴대폰번호 + 4자리 비밀번호(PIN).
 * 이름+휴대폰번호만으로는 그 둘을 아는 제3자가 로그인할 수 있어 보안이 약하다는
 * 지적이 있어(2026-08-13), 본인이 직접 설정하는 4자리 숫자 비밀번호를 3번째 요소로
 * 추가했다. must_reset_password가 true인 회원(최초 로그인 또는 관리자가 초기화한
 * 경우)은 이름+휴대폰번호 확인 후 새 비밀번호를 바로 설정하게 하고, 그렇지 않으면
 * 매번 비밀번호까지 함께 확인한다.
 *
 * 프론트는 2단계로 나눠 요청한다:
 *   1) {name, phone} 만 보내면 서버가 needsPin/needsPinSetup 중 하나를 알려준다.
 *   2) 그 안내에 맞춰 pin 또는 newPin(+newPinConfirm)을 추가해서 다시 요청하면
 *      그 자리에서 바로 로그인까지 완료된다.
 *
 * 이름만으로는 동명이인을 구분할 수 없으므로(설계 원칙), 반드시 휴대폰번호와 함께
 * 조회한다. 휴대폰번호는 DB에서 UNIQUE 제약이 걸려 있어 최대 1건만 일치한다.
 */
memberAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "이름과 휴대폰번호를 입력해주세요." });
  }
  const { name, pin, newPin, newPinConfirm } = parsed.data;
  const phoneParsed = parsePhone(parsed.data.phone);

  const genericError = { error: "입력하신 정보와 일치하는 회원을 찾을 수 없습니다." };

  if (!phoneParsed.ok) {
    return res.status(401).json(genericError);
  }

  // 휴대폰번호는 UNIQUE라 최대 1건만 일치한다. 먼저 휴대폰번호로 조회한 뒤,
  // 이름은 애플리케이션 단에서 비교한다 — 동명이인 구분을 위해 명부에 "이아영c"처럼
  // 끝에 소문자 알파벳 한 글자가 붙어 있는 경우가 있는데, 회원이 그 알파벳까지
  // 외워서 입력하긴 어려우므로 뒤의 소문자 한 글자는 생략해도 인식하도록 한다.
  const inputName = name.trim();
  const { rows } = await pool.query(
    `SELECT id, member_id, name_enc, status, password_hash, must_reset_password, failed_login_count, locked_until
     FROM members WHERE phone_hash = $1`,
    [hashPhone(phoneParsed.normalized)]
  );
  const candidate = rows[0] ? { ...rows[0], name: decryptName(rows[0].name_enc) } : undefined;
  const nameMatches =
    candidate && (candidate.name === inputName || candidate.name?.replace(/[a-z]$/, "") === inputName);
  const member = nameMatches ? candidate : undefined;

  if (!member) {
    // 계정 존재 여부를 노출하지 않도록 이름 불일치/휴대폰 불일치를 구분하지 않는다.
    await recordAudit({ action: "member_login_fail", newValue: { name } });
    return res.status(401).json(genericError);
  }

  if (member.status !== "active") {
    // 비활성 회원 로그인 차단 (PRD 12, 40)
    return res.status(403).json({ error: "탈퇴 또는 자격상실 처리된 회원입니다. 관리자에게 문의하세요." });
  }

  if (isLocked(member)) {
    return res.status(423).json({ error: "비밀번호를 여러 번 잘못 입력해 잠시 잠겼습니다. 잠시 후 다시 시도해주세요." });
  }

  const finishLogin = () => {
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: "로그인 처리 중 오류가 발생했습니다." });
      }
      req.session.auth = { role: "member", id: member.id };
      res.json({ ok: true });
    });
  };

  if (member.must_reset_password) {
    // 비밀번호가 아직 없는 상태(최초 로그인 또는 관리자 초기화 직후).
    if (!newPin) {
      return res.json({ ok: false, needsPinSetup: true });
    }
    if (!PIN_REGEX.test(newPin)) {
      return res.status(400).json({ error: "비밀번호는 숫자 4자리로 설정해주세요." });
    }
    if (newPin !== newPinConfirm) {
      return res.status(400).json({ error: "비밀번호가 서로 일치하지 않습니다." });
    }
    const hash = await hashPassword(newPin);
    await pool.query(
      `UPDATE members
       SET password_hash = $1, password_set_at = now(), must_reset_password = false,
           failed_login_count = 0, locked_until = NULL
       WHERE id = $2`,
      [hash, member.id]
    );
    await recordAudit({ memberId: member.member_id, action: "member_pin_set" });
    await recordAudit({ memberId: member.member_id, action: "member_login_success" });
    return finishLogin();
  }

  // 비밀번호가 이미 설정되어 있는 상태 — 확인까지 마쳐야 로그인된다.
  if (!pin) {
    return res.json({ ok: false, needsPin: true });
  }
  const pinOk = await verifyPassword(pin, member.password_hash);
  if (!pinOk) {
    await registerFailedAttempt("members", member.id, member.failed_login_count);
    await recordAudit({ memberId: member.member_id, action: "member_login_fail" });
    return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
  }

  await resetFailedAttempts("members", member.id);
  await recordAudit({ memberId: member.member_id, action: "member_login_success" });
  return finishLogin();
});

memberAuthRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("agongno.sid");
    res.json({ ok: true });
  });
});

memberAuthRouter.get("/me", memberGuard, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT name_enc, birth_date_enc, issue_date, photo_path FROM members WHERE id = $1 AND status = 'active'`,
    [req.session.auth!.id]
  );
  const member = rows[0];
  if (!member) {
    return res.status(401).json({ error: "세션이 만료되었거나 계정을 사용할 수 없습니다." });
  }
  res.json({
    name: decryptName(member.name_enc),
    birthDate: decryptBirthDate(member.birth_date_enc),
    issueDate: member.issue_date,
    hasPhoto: !!member.photo_path,
  });
});

memberAuthRouter.get("/me/photo", memberGuard, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT photo_path FROM members WHERE id = $1 AND status = 'active'`,
    [req.session.auth!.id]
  );
  const member = rows[0];
  if (!member) return res.status(401).json({ error: "세션이 만료되었습니다." });
  return streamPhotoOrDefault(res, member.photo_path);
});
