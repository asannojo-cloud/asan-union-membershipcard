import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool";
import { memberGuard } from "../../middleware/guards";
import { streamEventImage } from "./eventImages.service";
import { recordAudit } from "../audit/audit.service";

export const memberEventsRouter = Router();
memberEventsRouter.use(memberGuard);

// 조합사업(이벤트) 목록 — 이 회원이 이미 신청했는지, 신청했다면 확정/대기 상태인지도 함께 내려준다.
memberEventsRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.description, e.status, e.application_prompt, e.image_position_y, e.capacity,
            (e.image_path IS NOT NULL) AS has_image,
            a.status AS my_status,
            (SELECT COUNT(*)::int FROM union_event_applications c
             WHERE c.event_id = e.id AND c.status = 'confirmed') AS confirmed_count
     FROM union_events e
     LEFT JOIN union_event_applications a ON a.event_id = e.id AND a.member_id = $1
     WHERE e.is_visible = true
     ORDER BY e.display_order ASC NULLS LAST, e.created_at DESC`,
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
// 정원(capacity)이 설정된 이벤트는, 확정 인원이 이미 찬 상태에서 신청하면 대기자(waitlisted)로 접수된다
// — 동시에 여러 명이 신청해도 정원을 넘기지 않도록 이벤트 행을 잠그고 인원을 센 뒤 넣는다.
memberEventsRouter.post("/:id/apply", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, status, application_prompt, capacity FROM union_events WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const event = rows[0];
    if (!event) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "이벤트를 찾을 수 없습니다." });
    }
    if (event.status !== "open") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "마감된 행사입니다." });
    }

    let comment: string | null = null;
    if (event.application_prompt !== "없음") {
      const parsed = applySchema.safeParse(req.body);
      if (!parsed.success) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." });
      }
      comment = parsed.data.comment;
    }

    let waitlisted = false;
    if (event.capacity !== null) {
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM union_event_applications WHERE event_id = $1 AND status = 'confirmed'`,
        [id]
      );
      waitlisted = countRows[0].n >= event.capacity;
    }

    await client.query(
      `INSERT INTO union_event_applications (event_id, member_id, comment, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, member_id) DO UPDATE SET comment = EXCLUDED.comment`,
      [id, req.session.auth!.id, comment, waitlisted ? "waitlisted" : "confirmed"]
    );

    await client.query("COMMIT");

    const { rows: memberRows } = await pool.query(`SELECT member_id FROM members WHERE id = $1`, [
      req.session.auth!.id,
    ]);
    await recordAudit({
      memberId: memberRows[0]?.member_id ?? null,
      action: "event_apply",
      newValue: { eventId: id, comment, waitlisted },
    });

    res.json({ ok: true, waitlisted });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// 신청 취소 — 본인 신청만 취소할 수 있다. 확정자가 취소하면, 정원이 있던 자리이므로
// 가장 먼저 신청한 대기자를 자동으로 확정으로 올려준다.
memberEventsRouter.delete("/:id/apply", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`SELECT id FROM union_events WHERE id = $1 FOR UPDATE`, [id]);

    const { rows: cancelledRows } = await client.query(
      `DELETE FROM union_event_applications WHERE event_id = $1 AND member_id = $2 RETURNING status`,
      [id, req.session.auth!.id]
    );
    if (!cancelledRows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "신청 내역을 찾을 수 없습니다." });
    }

    if (cancelledRows[0].status === "confirmed") {
      await client.query(
        `UPDATE union_event_applications SET status = 'confirmed'
         WHERE id = (
           SELECT id FROM union_event_applications
           WHERE event_id = $1 AND status = 'waitlisted'
           ORDER BY applied_at ASC LIMIT 1
         )`,
        [id]
      );
    }

    await client.query("COMMIT");

    const { rows: memberRows } = await pool.query(`SELECT member_id FROM members WHERE id = $1`, [
      req.session.auth!.id,
    ]);
    await recordAudit({
      memberId: memberRows[0]?.member_id ?? null,
      action: "event_apply_cancel",
      newValue: { eventId: id },
    });

    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
