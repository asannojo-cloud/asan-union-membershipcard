import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../../db/pool";
import { env } from "../../config/env";
import { adminGuard } from "../../middleware/guards";
import {
  streamPhotoOrDefault,
  processAndStorePhoto,
  deletePhotoFile,
  searchPhotoCandidatesByName,
  streamRawR2Object,
  processAndStorePhotoFromR2Key,
} from "../photos/photos.service";
import { detectImageType, ALLOWED_PHOTO_EXT } from "../photos/imageValidation";
import { recordAudit } from "../audit/audit.service";
import { parseFlexibleDate } from "../../utils/dateUtils";
import { parsePhone } from "../../utils/phoneUtils";
import { encryptPhone, decryptPhone, hashPhone, maskPhone } from "../../utils/phoneCrypto";
import { encryptBirthDate, decryptBirthDate, maskBirthDate } from "../../utils/dateCrypto";
import { encryptName, decryptName, maskName } from "../../utils/nameCrypto";
import { searchMembers, getMemberDetail, getDashboardStats, suggestNextMemberId } from "./members.service";
import { AppError } from "../../middleware/errorHandler";

export const membersRouter = Router();
membersRouter.use(adminGuard);

const memberIdSchema = z.string().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/, "회원번호 형식이 올바르지 않습니다.");

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxPhotoSize },
  fileFilter: (req, file, cb) => {
    const ext = ("." + file.originalname.split(".").pop()).toLowerCase();
    if (!ALLOWED_PHOTO_EXT.has(ext)) {
      return cb(new AppError(400, "사진은 JPG, PNG, WEBP 형식만 업로드할 수 있습니다."));
    }
    cb(null, true);
  },
}).single("photo");

membersRouter.get("/dashboard", async (req, res) => {
  res.json(await getDashboardStats());
});

// 신규 등록 화면에서 "발급연도-일련번호" 형식(예: 2026-1)의 다음 번호를 제안한다. 강제는 아니다.
membersRouter.get("/next-id", async (req, res) => {
  const year = new Date().getFullYear();
  const suggested = await suggestNextMemberId(year);
  res.json({ suggested });
});

// "/:memberId" 라우트보다 반드시 앞에 있어야 한다 — 안 그러면 "photo-candidates"가
// memberId 파라미터로 잘못 매칭된다.
// 회원 상세/신규 등록 화면의 "사진 등록"에서, R2에 이미 올라와 있는 사진 중 같은
// 이름의 파일을 검색해 보여주기 위함 (부서별로 정리된 원본 사진 등을 재활용).
membersRouter.get("/photo-candidates", async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (!name) return res.json({ items: [] });
  const items = await searchPhotoCandidatesByName(name);
  res.json({ items });
});

// 위 검색 결과를 실제로 화면에 미리보기로 보여주기 위한 원본 이미지 스트리밍(관리자 전용).
membersRouter.get("/photo-preview", async (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) return res.status(400).json({ error: "key가 필요합니다." });
  return streamRawR2Object(res, key);
});

membersRouter.get("/", async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
  const query = typeof req.query.query === "string" ? req.query.query.trim() : undefined;
  const status = req.query.status === "active" || req.query.status === "inactive" ? req.query.status : undefined;
  const hasPhoto =
    req.query.hasPhoto === "true" ? true : req.query.hasPhoto === "false" ? false : undefined;

  const result = await searchMembers({ query, status, hasPhoto, page, pageSize });
  res.json({ items: result.rows, total: result.total, page, pageSize });
});

membersRouter.get("/:memberId", async (req, res) => {
  const parsed = memberIdSchema.safeParse(req.params.memberId);
  if (!parsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });
  const detail = await getMemberDetail(parsed.data);
  if (!detail) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });
  res.json(detail);
});

membersRouter.get("/:memberId/photo", async (req, res) => {
  const parsed = memberIdSchema.safeParse(req.params.memberId);
  if (!parsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });
  const { rows } = await pool.query(`SELECT photo_path FROM members WHERE member_id = $1`, [parsed.data]);
  if (!rows[0]) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });
  return streamPhotoOrDefault(res, rows[0].photo_path);
});

// 등록된 사진만 삭제한다 (회원 자체는 그대로 두고 "사진 없음" 상태로 되돌림).
membersRouter.delete("/:memberId/photo", async (req, res) => {
  const parsed = memberIdSchema.safeParse(req.params.memberId);
  if (!parsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });

  const { rows } = await pool.query(`SELECT photo_path FROM members WHERE member_id = $1`, [parsed.data]);
  if (!rows[0]) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });
  if (!rows[0].photo_path) return res.json({ ok: true }); // 이미 사진이 없으면 그냥 성공 처리

  await deletePhotoFile(rows[0].photo_path);
  await pool.query(`UPDATE members SET photo_path = NULL WHERE member_id = $1`, [parsed.data]);
  await recordAudit({
    adminId: req.session.auth!.id,
    memberId: parsed.data,
    action: "photo_delete",
    oldValue: { hadPhoto: true },
    newValue: { hadPhoto: false },
  });

  res.json({ ok: true });
});

// 회원 상세/수정 화면에서 사진을 새로 등록하거나 교체한다.
// multer 콜백 안의 async 함수는 express-async-errors가 잡아주는 "라우트 핸들러가 직접
// 반환한 Promise"가 아니라서, try/catch 없이 두면 실패 시 응답을 아예 못 보내고 요청이
// 그대로 멈춰버린다(2026-08-12, R2 전환 중 실제로 겪음 — 클라이언트는 타임아웃까지 무한 대기).
membersRouter.post("/:memberId/photo", (req, res, next) => {
  photoUpload(req, res, async (err) => {
    if (err) return next(err);
    try {
      const parsed = memberIdSchema.safeParse(req.params.memberId);
      if (!parsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });
      if (!req.file) return res.status(400).json({ error: "사진 파일을 선택해주세요." });

      const { rows } = await pool.query(`SELECT photo_path FROM members WHERE member_id = $1`, [parsed.data]);
      if (!rows[0]) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });

      if (!detectImageType(req.file.buffer)) {
        return res.status(400).json({ error: "사진 파일이 손상되었거나 지원하지 않는 형식입니다." });
      }

      const relPath = await processAndStorePhoto(req.file.buffer, parsed.data);
      await pool.query(`UPDATE members SET photo_path = $1 WHERE member_id = $2`, [relPath, parsed.data]);
      await recordAudit({
        adminId: req.session.auth!.id,
        memberId: parsed.data,
        action: "photo_update",
        oldValue: { hadPhoto: !!rows[0].photo_path },
        newValue: { hadPhoto: true },
      });

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
});

const photoFromR2Schema = z.object({ key: z.string().min(1) });

// "사진 등록" 화면에서 검색된 후보(R2에 이미 있는 사진) 중 하나를 회원 사진으로 확정한다.
membersRouter.post("/:memberId/photo-from-r2", async (req, res) => {
  const parsed = memberIdSchema.safeParse(req.params.memberId);
  if (!parsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });

  const body = photoFromR2Schema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "선택한 사진 정보가 올바르지 않습니다." });

  const { rows } = await pool.query(`SELECT photo_path FROM members WHERE member_id = $1`, [parsed.data]);
  if (!rows[0]) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });

  const relPath = await processAndStorePhotoFromR2Key(body.data.key, parsed.data);
  await pool.query(`UPDATE members SET photo_path = $1 WHERE member_id = $2`, [relPath, parsed.data]);
  await recordAudit({
    adminId: req.session.auth!.id,
    memberId: parsed.data,
    action: "photo_update",
    oldValue: { hadPhoto: !!rows[0].photo_path },
    newValue: { hadPhoto: true, source: "r2_search", sourceKey: body.data.key },
  });

  res.json({ ok: true });
});

const createSchema = z.object({
  memberId: memberIdSchema,
  name: z.string().min(1).max(50),
  birthDate: z.string(),
  issueDate: z.string(),
  phone: z.string().min(1, "휴대폰번호를 입력해주세요."),
});

membersRouter.post("/", (req, res, next) => {
  photoUpload(req, res, async (err) => {
    if (err) return next(err);
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "입력값을 확인해주세요.", details: parsed.error.flatten() });
      }
      const { memberId, name, birthDate, issueDate, phone } = parsed.data;

      const birth = parseFlexibleDate(birthDate);
      const issue = parseFlexibleDate(issueDate);
      if (!birth.ok) return res.status(400).json({ error: `생년월일 오류: ${birth.error}` });
      if (!issue.ok) return res.status(400).json({ error: `발급일 오류: ${issue.error}` });

      const phoneParsed = parsePhone(phone);
      if (!phoneParsed.ok) return res.status(400).json({ error: `휴대폰번호 오류: ${phoneParsed.error}` });

      // 사진이 첨부된 경우, DB에 저장하기 전에 먼저 매직바이트로 실제 이미지 형식인지 검증한다
      // (확장자 위장 차단). 사진 자체는 선택 항목이므로 검증 실패해도 회원 등록은 막지 않는다.
      let photoWarning: string | null = null;
      if (req.file && !detectImageType(req.file.buffer)) {
        photoWarning = "사진 파일이 손상되었거나 지원하지 않는 형식이라 등록되지 않았습니다.";
      }

      const existing = await pool.query(`SELECT 1 FROM members WHERE member_id = $1`, [memberId]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "이미 존재하는 회원번호입니다." });
      }

      const phoneHash = hashPhone(phoneParsed.normalized);
      const phoneOwner = await pool.query(`SELECT member_id FROM members WHERE phone_hash = $1`, [phoneHash]);
      if (phoneOwner.rows.length > 0) {
        return res.status(409).json({ error: `이미 다른 회원(${phoneOwner.rows[0].member_id})에게 등록된 휴대폰번호입니다.` });
      }

      await pool.query(
        `INSERT INTO members (member_id, name_enc, birth_date_enc, issue_date, phone_enc, phone_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [memberId, encryptName(name), encryptBirthDate(birth.iso), issue.iso, encryptPhone(phoneParsed.normalized), phoneHash]
      );

      await recordAudit({
        adminId: req.session.auth!.id,
        memberId,
        action: "create",
        newValue: { name: maskName(name), birthDate: maskBirthDate(birth.iso), issueDate: issue.iso, phone: maskPhone(phoneParsed.normalized) },
      });

      if (req.file && !photoWarning) {
        const relPath = await processAndStorePhoto(req.file.buffer, memberId);
        await pool.query(`UPDATE members SET photo_path = $1 WHERE member_id = $2`, [relPath, memberId]);
        await recordAudit({ adminId: req.session.auth!.id, memberId, action: "photo_update" });
      }

      res.status(201).json({ ok: true, memberId, photoWarning });
    } catch (e) {
      next(e);
    }
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  birthDate: z.string().optional(),
  issueDate: z.string().optional(),
  phone: z.string().optional(),
});

membersRouter.put("/:memberId", async (req, res) => {
  const memberIdParsed = memberIdSchema.safeParse(req.params.memberId);
  if (!memberIdParsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "입력값을 확인해주세요." });

  const { rows } = await pool.query(`SELECT * FROM members WHERE member_id = $1`, [memberIdParsed.data]);
  const before = rows[0];
  if (!before) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });

  const updates: Record<string, string> = {};
  // 감사로그에는 실제 DB에 쓰는 값(updates)과 다르게, 전화번호는 마스킹된 값만 남긴다.
  const auditNewValue: Record<string, string> = {};
  if (parsed.data.name !== undefined) {
    updates.name_enc = encryptName(parsed.data.name);
    auditNewValue.name = maskName(parsed.data.name) ?? "";
  }
  if (parsed.data.birthDate !== undefined) {
    const r = parseFlexibleDate(parsed.data.birthDate);
    if (!r.ok) return res.status(400).json({ error: `생년월일 오류: ${r.error}` });
    updates.birth_date_enc = encryptBirthDate(r.iso);
    auditNewValue.birthDate = maskBirthDate(r.iso) ?? "";
  }
  if (parsed.data.issueDate !== undefined) {
    const r = parseFlexibleDate(parsed.data.issueDate);
    if (!r.ok) return res.status(400).json({ error: `발급일 오류: ${r.error}` });
    updates.issue_date = r.iso;
    auditNewValue.issueDate = r.iso;
  }
  if (parsed.data.phone !== undefined) {
    const r = parsePhone(parsed.data.phone);
    if (!r.ok) return res.status(400).json({ error: `휴대폰번호 오류: ${r.error}` });
    const owner = await pool.query(`SELECT member_id FROM members WHERE phone_hash = $1 AND member_id != $2`, [
      hashPhone(r.normalized),
      memberIdParsed.data,
    ]);
    if (owner.rows.length > 0) {
      return res.status(409).json({ error: `이미 다른 회원(${owner.rows[0].member_id})에게 등록된 휴대폰번호입니다.` });
    }
    updates.phone_enc = encryptPhone(r.normalized);
    updates.phone_hash = hashPhone(r.normalized);
    auditNewValue.phone = maskPhone(r.normalized) ?? "";
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "변경할 값이 없습니다." });
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
  await pool.query(
    `UPDATE members SET ${setClauses.join(", ")} WHERE member_id = $1`,
    [memberIdParsed.data, ...Object.values(updates)]
  );

  await recordAudit({
    adminId: req.session.auth!.id,
    memberId: memberIdParsed.data,
    action: "update",
    oldValue: {
      name: maskName(decryptName(before.name_enc)),
      birthDate: maskBirthDate(decryptBirthDate(before.birth_date_enc)),
      issueDate: before.issue_date,
      phone: maskPhone(decryptPhone(before.phone_enc)),
    },
    newValue: auditNewValue,
  });

  res.json({ ok: true });
});

// 회원이 로그인 비밀번호(4자리)를 잊어버렸을 때 관리자가 초기화한다.
// 초기화하면 must_reset_password가 다시 true가 되어, 다음 로그인 때 이름+휴대폰번호
// 확인 후 새 비밀번호를 설정하는 화면으로 자동 전환된다.
membersRouter.post("/:memberId/reset-pin", async (req, res) => {
  const memberIdParsed = memberIdSchema.safeParse(req.params.memberId);
  if (!memberIdParsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });

  const { rows } = await pool.query(`SELECT id FROM members WHERE member_id = $1`, [memberIdParsed.data]);
  if (!rows[0]) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });

  await pool.query(
    `UPDATE members
     SET password_hash = NULL, password_set_at = NULL, must_reset_password = true,
         failed_login_count = 0, locked_until = NULL
     WHERE member_id = $1`,
    [memberIdParsed.data]
  );
  await recordAudit({
    adminId: req.session.auth!.id,
    memberId: memberIdParsed.data,
    action: "member_pin_reset",
  });
  res.json({ ok: true });
});

membersRouter.post("/:memberId/deactivate", async (req, res) => {
  const memberIdParsed = memberIdSchema.safeParse(req.params.memberId);
  if (!memberIdParsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });

  const { rows } = await pool.query(`SELECT status FROM members WHERE member_id = $1`, [memberIdParsed.data]);
  if (!rows[0]) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });
  if (rows[0].status === "inactive") {
    return res.json({ ok: true, alreadyInactive: true });
  }

  await pool.query(`UPDATE members SET status = 'inactive' WHERE member_id = $1`, [memberIdParsed.data]);
  await recordAudit({
    adminId: req.session.auth!.id,
    memberId: memberIdParsed.data,
    action: "deactivate",
    oldValue: { status: "active" },
    newValue: { status: "inactive" },
  });
  res.json({ ok: true });
});

membersRouter.post("/:memberId/reactivate", async (req, res) => {
  const memberIdParsed = memberIdSchema.safeParse(req.params.memberId);
  if (!memberIdParsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });

  const { rows } = await pool.query(`SELECT status FROM members WHERE member_id = $1`, [memberIdParsed.data]);
  if (!rows[0]) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });

  await pool.query(`UPDATE members SET status = 'active' WHERE member_id = $1`, [memberIdParsed.data]);
  await recordAudit({
    adminId: req.session.auth!.id,
    memberId: memberIdParsed.data,
    action: "reactivate",
    oldValue: { status: rows[0].status },
    newValue: { status: "active" },
  });
  res.json({ ok: true });
});

// 회원 완전 삭제. 데이터 안전을 위해 반드시 "비활성" 상태인 회원만 삭제할 수 있다
// (PRD 37: 물리 삭제 원칙적 금지 — 단, 관리자가 명시적으로 비활성화한 뒤 확인 후 삭제하는 것만 허용).
membersRouter.delete("/:memberId", async (req, res) => {
  const memberIdParsed = memberIdSchema.safeParse(req.params.memberId);
  if (!memberIdParsed.success) return res.status(400).json({ error: "회원번호 형식이 올바르지 않습니다." });

  const { rows } = await pool.query(
    `SELECT name_enc, birth_date_enc, issue_date::text, status, phone_enc, photo_path FROM members WHERE member_id = $1`,
    [memberIdParsed.data]
  );
  const member = rows[0];
  if (!member) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });
  if (member.status !== "inactive") {
    return res.status(409).json({ error: "비활성화된 회원만 삭제할 수 있습니다. 먼저 회원을 비활성화해주세요." });
  }

  await pool.query(`DELETE FROM members WHERE member_id = $1 AND status = 'inactive'`, [memberIdParsed.data]);
  await deletePhotoFile(member.photo_path);

  await recordAudit({
    adminId: req.session.auth!.id,
    memberId: memberIdParsed.data,
    action: "delete",
    oldValue: {
      name: maskName(decryptName(member.name_enc)),
      birthDate: maskBirthDate(decryptBirthDate(member.birth_date_enc)),
      issueDate: member.issue_date,
      phone: maskPhone(decryptPhone(member.phone_enc)),
    },
  });

  res.json({ ok: true });
});

const bulkDeleteSchema = z.object({
  memberIds: z.array(memberIdSchema).min(1).max(500),
});

// 회원목록 화면에서 여러 명을 체크해 한 번에 삭제한다. 단일 삭제와 동일하게
// "비활성" 상태인 회원만 대상이며, 선택 항목 중 활성 회원은 건너뛰고 사유를 알려준다.
membersRouter.post("/bulk-delete", async (req, res) => {
  const parsed = bulkDeleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "삭제할 회원을 선택해주세요." });

  const deleted: string[] = [];
  const skipped: { memberId: string; reason: string }[] = [];

  for (const memberId of parsed.data.memberIds) {
    const { rows } = await pool.query(
      `SELECT name_enc, birth_date_enc, issue_date::text, status, phone_enc, photo_path FROM members WHERE member_id = $1`,
      [memberId]
    );
    const member = rows[0];
    if (!member) {
      skipped.push({ memberId, reason: "존재하지 않는 회원" });
      continue;
    }
    if (member.status !== "inactive") {
      skipped.push({ memberId, reason: "활성 회원은 삭제할 수 없음 (먼저 비활성화 필요)" });
      continue;
    }

    await pool.query(`DELETE FROM members WHERE member_id = $1 AND status = 'inactive'`, [memberId]);
    await deletePhotoFile(member.photo_path);
    await recordAudit({
      adminId: req.session.auth!.id,
      memberId,
      action: "delete",
      oldValue: {
        name: maskName(decryptName(member.name_enc)),
        birthDate: maskBirthDate(decryptBirthDate(member.birth_date_enc)),
        issueDate: member.issue_date,
        phone: maskPhone(decryptPhone(member.phone_enc)),
      },
    });
    deleted.push(memberId);
  }

  res.json({ deleted, skipped });
});
