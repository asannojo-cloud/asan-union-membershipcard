import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool";
import { memberGuard } from "../../middleware/guards";
import { streamEventImage } from "./eventImages.service";
import { recordAudit } from "../audit/audit.service";

export const memberEventsRouter = Router();
memberEventsRouter.use(memberGuard);

// 조합사업(이벤트) 목록 — 이 회원이 이미 신청했는지 여부도 함께 내려준다.
memberEventsRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.description, e.status, e.application_prompt, e.image_position_y,
            (e.image_path IS NOT NULL) AS has_image,
            EXISTS(
              SELECT 1 FROM union_event_applications a
              WHERE a.event_id = e.id AND a.member_id = $1
            ) AS applied
     FROM union_events e
     ORDER BY e.created_at DESC`,
    [req.session.auth!.id]
  );
  res.json({ items: rows });
});

memberEventsRouter.get("/:id/image", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });
  const { rows } = await pool.query(`SELECT image_path FROM union_events WHERE id = $1`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "이벤트를 찾을 수 없습니다." });
  return streamEventImage(res, rows[0].image_path);
});

const applySchema = z.object({
  comment: z.string().trim().min(1, "내용을 입력해주세요.").max(500),
});

// 참여하기 — 로그인된 본인 정보로 즉시 신청 기록. 중복 신청은 조용히 성공 처리한다.
// 관리자가 이벤트의 신청 문구를 "없음"으로 설정한 경우엔 입력값 없이도 신청할 수 있다.
memberEventsRouter.post("/:id/apply", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

  const { rows } = await pool.query(`SELECT id, status, application_prompt FROM union_events WHERE id = $1`, [id]);
  const event = rows[0];
  if (!event) return res.status(404).json({ error: "이벤트를 찾을 수 없습니다." });
  if (event.status !== "open") {
    return res.status(409).json({ error: "마감된 행사입니다." });
  }

  let comment: string | null = null;
  if (event.application_prompt !== "없음") {
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." });
    }
    comment = parsed.data.comment;
  }

  await pool.query(
    `INSERT INTO union_event_applications (event_id, member_id, comment)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, member_id) DO UPDATE SET comment = EXCLUDED.comment`,
    [id, req.session.auth!.id, comment]
  );

  const { rows: memberRows } = await pool.query(`SELECT member_id FROM members WHERE id = $1`, [
    req.session.auth!.id,
  ]);
  await recordAudit({
    memberId: memberRows[0]?.member_id ?? null,
    action: "event_apply",
    newValue: { eventId: id, comment },
  });

  res.json({ ok: true });
});

// 신청 취소 — 본인 신청만 취소할 수 있다.
memberEventsRouter.delete("/:id/apply", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

  const { rowCount } = await pool.query(
    `DELETE FROM union_event_applications WHERE event_id = $1 AND member_id = $2`,
    [id, req.session.auth!.id]
  );
  if (!rowCount) return res.status(404).json({ error: "신청 내역을 찾을 수 없습니다." });

  const { rows: memberRows } = await pool.query(`SELECT member_id FROM members WHERE id = $1`, [
    req.session.auth!.id,
  ]);
  await recordAudit({
    memberId: memberRows[0]?.member_id ?? null,
    action: "event_apply_cancel",
    newValue: { eventId: id },
  });

  res.json({ ok: true });
});
