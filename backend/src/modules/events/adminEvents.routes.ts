import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../../db/pool";
import { env } from "../../config/env";
import { adminGuard } from "../../middleware/guards";
import { AppError } from "../../middleware/errorHandler";
import { detectImageType, ALLOWED_PHOTO_EXT } from "../photos/imageValidation";
import { processAndStoreEventImage, deleteEventImage, streamEventImage } from "./eventImages.service";
import { decryptName } from "../../utils/nameCrypto";
import { decryptPhone } from "../../utils/phoneCrypto";
import { recordAudit } from "../audit/audit.service";

export const adminEventsRouter = Router();
adminEventsRouter.use(adminGuard);

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxPhotoSize },
  fileFilter: (req, file, cb) => {
    const ext = ("." + file.originalname.split(".").pop()).toLowerCase();
    if (!ALLOWED_PHOTO_EXT.has(ext)) {
      return cb(new AppError(400, "이미지는 JPG, PNG, WEBP 형식만 업로드할 수 있습니다."));
    }
    cb(null, true);
  },
}).single("image");

// 이벤트 목록 (신청자 수 포함).
adminEventsRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.id, e.title, e.description, e.status, (e.image_path IS NOT NULL) AS has_image,
           e.application_prompt, e.image_position_y,
           e.created_at,
           (SELECT COUNT(*)::int FROM union_event_applications a WHERE a.event_id = e.id) AS applicant_count
    FROM union_events e
    ORDER BY e.created_at DESC
  `);
  res.json({ items: rows });
});

adminEventsRouter.get("/:id/image", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });
  const { rows } = await pool.query(`SELECT image_path FROM union_events WHERE id = $1`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "이벤트를 찾을 수 없습니다." });
  return streamEventImage(res, rows[0].image_path);
});

// 신청자 명단 (이름/전화번호는 암호화되어 있어 복호화해서 내려준다).
adminEventsRouter.get("/:id/applications", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

  const { rows: eventRows } = await pool.query(`SELECT id, title FROM union_events WHERE id = $1`, [id]);
  if (!eventRows[0]) return res.status(404).json({ error: "이벤트를 찾을 수 없습니다." });

  const { rows } = await pool.query(
    `SELECT m.member_id, m.name_enc, m.phone_enc, a.applied_at, a.comment
     FROM union_event_applications a
     JOIN members m ON m.id = a.member_id
     WHERE a.event_id = $1
     ORDER BY a.applied_at ASC`,
    [id]
  );
  const applicants = rows.map((r) => ({
    memberId: r.member_id,
    name: decryptName(r.name_enc),
    phone: decryptPhone(r.phone_enc),
    appliedAt: r.applied_at,
    comment: r.comment,
  }));

  res.json({ event: eventRows[0], applicants });
});

// 신청 시 회원에게 보여줄 질문 문구는 관리자가 이벤트마다 직접 입력하거나(자유 텍스트),
// 프론트엔드에서 제공하는 자주 쓰는 문구 중 골라 쓸 수 있다 — 값 자체는 그냥 텍스트라
// 어느 쪽이든 서버는 동일하게 처리한다.
const imagePositionY = z.coerce.number().int().min(0).max(100);
// 관리자가 자주 쓰는 문구를 고르거나(프론트엔드 datalist 제안) 직접 타이핑할 수도 있다 —
// 값 자체는 자유 텍스트라 서버는 특정 목록에 있는지 검사하지 않는다. 다만 "없음"이라는
// 값을 그대로 쓰면 회원 화면에 입력창 자체가 뜨지 않고 바로 신청 처리된다
// (memberEvents.routes.ts 참고).
const DEFAULT_APPLICATION_PROMPT = "신청사유";
const applicationPromptSchema = z.string().min(1).max(200);

const createSchema = z.object({
  title: z.string().min(1, "이벤트명을 입력해주세요.").max(100),
  description: z.string().max(2000).optional(),
  applicationPrompt: applicationPromptSchema.optional(),
  imagePositionY: imagePositionY.optional(),
});

adminEventsRouter.post("/", (req, res, next) => {
  imageUpload(req, res, async (err) => {
    if (err) return next(err);
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "입력값을 확인해주세요.", details: parsed.error.flatten() });
      }
      const { title, description, applicationPrompt, imagePositionY } = parsed.data;

      if (req.file && !detectImageType(req.file.buffer)) {
        return res.status(400).json({ error: "이미지 파일이 손상되었거나 지원하지 않는 형식입니다." });
      }

      const { rows } = await pool.query(
        `INSERT INTO union_events (title, description, application_prompt, image_position_y)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [
          title,
          description ?? null,
          applicationPrompt || DEFAULT_APPLICATION_PROMPT,
          imagePositionY ?? 50,
        ]
      );
      const id = rows[0].id;

      if (req.file) {
        const key = await processAndStoreEventImage(req.file.buffer, id);
        await pool.query(`UPDATE union_events SET image_path = $1 WHERE id = $2`, [key, id]);
      }

      await recordAudit({
        adminId: req.session.auth!.id,
        action: "event_create",
        newValue: { title, eventId: id },
      });

      res.status(201).json({ ok: true, id });
    } catch (e) {
      next(e);
    }
  });
});

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["open", "closed"]).optional(),
  applicationPrompt: applicationPromptSchema.optional(),
  imagePositionY: imagePositionY.optional(),
});

adminEventsRouter.put("/:id", (req, res, next) => {
  imageUpload(req, res, async (err) => {
    if (err) return next(err);
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "입력값을 확인해주세요." });

      const { rows } = await pool.query(`SELECT id FROM union_events WHERE id = $1`, [id]);
      if (!rows[0]) return res.status(404).json({ error: "이벤트를 찾을 수 없습니다." });

      const updates: Record<string, string | number> = {};
      if (parsed.data.title !== undefined) updates.title = parsed.data.title;
      if (parsed.data.description !== undefined) updates.description = parsed.data.description;
      if (parsed.data.status !== undefined) updates.status = parsed.data.status;
      if (parsed.data.applicationPrompt !== undefined) updates.application_prompt = parsed.data.applicationPrompt;
      if (parsed.data.imagePositionY !== undefined) updates.image_position_y = parsed.data.imagePositionY;

      if (req.file && !detectImageType(req.file.buffer)) {
        return res.status(400).json({ error: "이미지 파일이 손상되었거나 지원하지 않는 형식입니다." });
      }
      if (req.file) {
        const key = await processAndStoreEventImage(req.file.buffer, id);
        updates.image_path = key;
      }

      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
        await pool.query(`UPDATE union_events SET ${setClauses.join(", ")} WHERE id = $1`, [
          id,
          ...Object.values(updates),
        ]);
      }

      await recordAudit({ adminId: req.session.auth!.id, action: "event_update", newValue: { eventId: id, ...updates } });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
});

adminEventsRouter.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

  const { rows } = await pool.query(`SELECT image_path, title FROM union_events WHERE id = $1`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "이벤트를 찾을 수 없습니다." });

  await pool.query(`DELETE FROM union_events WHERE id = $1`, [id]);
  await deleteEventImage(rows[0].image_path);
  await recordAudit({ adminId: req.session.auth!.id, action: "event_delete", oldValue: { eventId: id, title: rows[0].title } });

  res.json({ ok: true });
});
