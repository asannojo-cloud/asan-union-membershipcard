import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../../db/pool";
import { adminGuard } from "../../middleware/guards";
import { env } from "../../config/env";
import { parseWorkbook } from "./workbook";
import { suggestColumnMapping, FieldKey, REQUIRED_FIELDS, FIELD_LABELS } from "./columnMapping";
import { validateRows, summarize, ExistingMember } from "./validators";
import { extractPhotoZip } from "../photos/zipHandler";
import { processAndStorePhoto } from "../photos/photos.service";
import { recordAudit } from "../audit/audit.service";
import { AppError } from "../../middleware/errorHandler";
import { encryptPhone, decryptPhone, hashPhone, maskPhone } from "../../utils/phoneCrypto";

export const excelRouter = Router();
excelRouter.use(adminGuard);

fs.mkdirSync(env.uploadTmpDir, { recursive: true });

// 관리자가 채워 넣기만 하면 되는 회원명부 양식(.xlsx)을 내려받는다.
excelRouter.get("/template", (req, res) => {
  const headerRow = ["회원번호", "이름", "휴대폰번호", "생년월일", "발급일", "사진파일명", "상태"];
  const exampleRows = [
    ["2026-1", "홍길동", "010-1234-5678", "1985-03-15", "2026-08-11", "2026-1.jpg", "정상"],
    ["", "김철수", "010-2345-6789", "1987-04-20", "", "", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...exampleRows]);
  ws["!cols"] = [
    { wch: 12 }, // 회원번호
    { wch: 10 }, // 이름
    { wch: 15 }, // 휴대폰번호
    { wch: 12 }, // 생년월일
    { wch: 12 }, // 발급일
    { wch: 16 }, // 사진파일명
    { wch: 8 }, // 상태
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "회원명부");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const filename = "회원명부_양식.xlsx";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="member-template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.send(buffer);
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxExcelSize },
  fileFilter: (req, file, cb) => {
    const okExt = file.originalname.toLowerCase().endsWith(".xlsx");
    if (!okExt) return cb(new AppError(400, "Excel 파일(.xlsx)만 업로드할 수 있습니다."));
    cb(null, true);
  },
}).single("excelFile");

const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxZipSize },
  fileFilter: (req, file, cb) => {
    const okExt = file.originalname.toLowerCase().endsWith(".zip");
    if (!okExt) return cb(new AppError(400, "사진은 .zip 파일로만 업로드할 수 있습니다."));
    cb(null, true);
  },
}).single("zipFile");

// STEP1~2: Excel 선택 → 헤더 분석 + 컬럼 매핑 제안
excelRouter.post("/headers", (req, res, next) => {
  excelUpload(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: "Excel 파일을 선택해주세요." });

    try {
      const { headers, rows } = parseWorkbook(req.file.buffer);
      if (headers.length === 0) {
        return res.status(400).json({ error: "빈 Excel 파일입니다. 헤더 행을 확인해주세요." });
      }
      const suggestedMapping = suggestColumnMapping(headers);

      const token = uuidv4();
      fs.writeFileSync(path.join(env.uploadTmpDir, `${token}.xlsx`), req.file.buffer);
      fs.writeFileSync(
        path.join(env.uploadTmpDir, `${token}.meta.json`),
        JSON.stringify({ fileName: req.file.originalname, createdAt: Date.now() })
      );

      res.json({
        token,
        fileName: req.file.originalname,
        headers,
        suggestedMapping,
        totalRows: rows.length,
        requiredFields: REQUIRED_FIELDS.map((f) => ({ key: f, label: FIELD_LABELS[f] })),
      });
    } catch (e) {
      next(e);
    }
  });
});

// STEP3: 매핑 확정 + (선택)사진 ZIP → 검증 및 임시 영역 저장
excelRouter.post("/validate", (req, res, next) => {
  zipUpload(req, res, async (err) => {
    if (err) return next(err);
    try {
      const token = String(req.body.token ?? "");
      let mapping: Partial<Record<FieldKey, string>>;
      try {
        mapping = JSON.parse(String(req.body.mapping ?? "{}"));
      } catch {
        return res.status(400).json({ error: "컬럼 매핑 형식이 올바르지 않습니다." });
      }

      if (!/^[a-f0-9-]{36}$/.test(token)) {
        return res.status(400).json({ error: "유효하지 않은 업로드 토큰입니다. 다시 업로드해주세요." });
      }
      const excelPath = path.join(env.uploadTmpDir, `${token}.xlsx`);
      const metaPath = path.join(env.uploadTmpDir, `${token}.meta.json`);
      if (!fs.existsSync(excelPath) || !fs.existsSync(metaPath)) {
        return res.status(400).json({ error: "업로드 세션이 만료되었습니다. Excel을 다시 선택해주세요." });
      }

      const missing = REQUIRED_FIELDS.filter((f) => !mapping[f]);
      if (missing.length > 0) {
        return res.status(400).json({
          error: `필수 컬럼 매핑이 누락되었습니다: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}`,
        });
      }

      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      const buffer = fs.readFileSync(excelPath);
      const { rows } = parseWorkbook(buffer);

      // 사진 ZIP 처리 (선택)
      let availablePhotoFiles = new Set<string>();
      let extractDir: string | null = null;
      let zipErrors: string[] = [];
      let zipFileName: string | null = null;
      if (req.file) {
        zipFileName = req.file.originalname;
        extractDir = path.join(env.uploadTmpDir, `photos-${uuidv4()}`);
        const result = extractPhotoZip(req.file.buffer, extractDir, env.maxPhotoSize);
        availablePhotoFiles = new Set(result.files.keys());
        zipErrors = result.errors;
      }

      // 기존 회원 조회 (변경 여부 비교용) — phone은 암호화되어 있어 복호화해서 넘긴다.
      const { rows: existingRowsEnc } = await pool.query<Omit<ExistingMember, "phone"> & { phone_enc: string | null }>(
        `SELECT member_id, name, birth_date::text, issue_date::text, status, photo_path, phone_enc FROM members`
      );
      const existingRows: ExistingMember[] = existingRowsEnc.map(({ phone_enc, ...r }) => ({
        ...r,
        phone: decryptPhone(phone_enc),
      }));
      const existingMap = new Map(existingRows.map((r) => [r.member_id, r]));

      const staged = validateRows(rows, mapping, existingMap, availablePhotoFiles);
      const summary = summarize(staged);

      const { rows: batchRows } = await pool.query(
        `INSERT INTO upload_batches
          (file_name, uploaded_by, total_rows, new_count, updated_count, unchanged_count, inactive_count, error_count,
           status, column_mapping, staged_rows, error_detail, photo_zip_name, photo_extract_dir)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'validated',$9,$10,$11,$12,$13)
         RETURNING id, uploaded_at`,
        [
          meta.fileName,
          req.session.auth!.id,
          summary.totalRows,
          summary.newCount,
          summary.updatedCount,
          summary.unchangedCount,
          summary.inactiveCount,
          summary.errorCount,
          JSON.stringify(mapping),
          JSON.stringify(staged),
          JSON.stringify({ zipErrors }),
          zipFileName,
          extractDir,
        ]
      );

      // 소비된 토큰 파일 정리
      fs.unlinkSync(excelPath);
      fs.unlinkSync(metaPath);

      res.json({
        batchId: batchRows[0].id,
        uploadedAt: batchRows[0].uploaded_at,
        summary,
        rows: staged,
        zipErrors,
      });
    } catch (e) {
      next(e);
    }
  });
});

excelRouter.get("/batches", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ub.id, ub.file_name, ub.uploaded_at, ub.committed_at, ub.status,
            ub.total_rows, ub.new_count, ub.updated_count, ub.unchanged_count, ub.inactive_count, ub.error_count,
            a.name AS uploaded_by_name
     FROM upload_batches ub
     LEFT JOIN admins a ON a.id = ub.uploaded_by
     ORDER BY ub.uploaded_at DESC
     LIMIT 50`
  );
  res.json({ items: rows });
});

excelRouter.get("/batches/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

  const { rows } = await pool.query(`SELECT * FROM upload_batches WHERE id = $1`, [id]);
  const batch = rows[0];
  if (!batch) return res.status(404).json({ error: "업로드 이력을 찾을 수 없습니다." });
  res.json(batch);
});

excelRouter.post("/batches/:id/cancel", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

  const { rows } = await pool.query(`SELECT * FROM upload_batches WHERE id = $1`, [id]);
  const batch = rows[0];
  if (!batch) return res.status(404).json({ error: "업로드 이력을 찾을 수 없습니다." });
  if (batch.status !== "validated") {
    return res.status(409).json({ error: "이미 처리되었거나 취소할 수 없는 상태입니다." });
  }

  await pool.query(`UPDATE upload_batches SET status = 'cancelled' WHERE id = $1`, [id]);
  if (batch.photo_extract_dir) {
    fs.rmSync(batch.photo_extract_dir, { recursive: true, force: true });
  }
  res.json({ ok: true });
});

// STEP4: 최종 반영 — 오류 0건일 때만 허용, 트랜잭션으로 전체 성공/전체 취소
excelRouter.post("/batches/:id/commit", async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청입니다." });

  const { rows } = await pool.query(`SELECT * FROM upload_batches WHERE id = $1`, [id]);
  const batch = rows[0];
  if (!batch) return res.status(404).json({ error: "업로드 이력을 찾을 수 없습니다." });
  if (batch.status !== "validated") {
    return res.status(409).json({ error: "이미 처리되었거나 반영할 수 없는 상태입니다." });
  }
  if (batch.error_count > 0) {
    return res.status(422).json({ error: "오류가 있는 데이터는 반영할 수 없습니다. 오류를 수정한 뒤 다시 업로드해주세요." });
  }

  const stagedRows: import("./validators").StagedRow[] = batch.staged_rows ?? [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const row of stagedRows) {
      if (row.changeType === "error" || !row.memberId) continue;

      if (row.changeType === "new") {
        // row.phone은 validateRows에서 이미 필수값으로 검증됐다 (에러행은 위에서 continue됨).
        await client.query(
          `INSERT INTO members (member_id, name, birth_date, issue_date, status, phone_enc, phone_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            row.memberId,
            row.name,
            row.birthDate,
            row.issueDate,
            row.targetStatus ?? "active",
            encryptPhone(row.phone!),
            hashPhone(row.phone!),
          ]
        );
        await recordAudit(
          {
            adminId: req.session.auth!.id,
            memberId: row.memberId,
            batchId: id,
            action: "excel_create",
            newValue: { name: row.name, birthDate: row.birthDate, issueDate: row.issueDate, phone: maskPhone(row.phone) },
          },
          client
        );
      } else if (row.changeType === "update" || row.changeType === "inactive") {
        const { rows: beforeRows } = await client.query(
          `SELECT name, birth_date::text, issue_date::text, status, phone_enc FROM members WHERE member_id = $1`,
          [row.memberId]
        );
        const before = beforeRows[0];
        const beforePhone = decryptPhone(before.phone_enc);
        // 휴대폰번호는 엑셀에 값이 없으면 기존 값을 그대로 유지한다 (실수로 지워지는 것을 방지)
        const nextPhone = row.phone ?? beforePhone!;
        await client.query(
          `UPDATE members SET name = $1, birth_date = $2, issue_date = $3, status = $4, phone_enc = $5, phone_hash = $6 WHERE member_id = $7`,
          [row.name, row.birthDate, row.issueDate, row.targetStatus ?? "active", encryptPhone(nextPhone), hashPhone(nextPhone), row.memberId]
        );
        await recordAudit(
          {
            adminId: req.session.auth!.id,
            memberId: row.memberId,
            batchId: id,
            action: row.changeType === "inactive" ? "excel_deactivate" : "excel_update",
            oldValue: { name: before.name, birthDate: before.birth_date, issueDate: before.issue_date, status: before.status, phone: maskPhone(beforePhone) },
            newValue: { name: row.name, birthDate: row.birthDate, issueDate: row.issueDate, status: row.targetStatus, phone: maskPhone(nextPhone) },
          },
          client
        );
      }
      // unchanged: 아무 작업 없음

      // 사진 매칭 반영
      if (row.photoFile && row.photoAvailable && batch.photo_extract_dir) {
        const srcPath = path.join(batch.photo_extract_dir, row.photoFile);
        if (fs.existsSync(srcPath)) {
          const relPath = await processAndStorePhoto(srcPath, row.memberId);
          await client.query(`UPDATE members SET photo_path = $1 WHERE member_id = $2`, [relPath, row.memberId]);
          await recordAudit(
            { adminId: req.session.auth!.id, memberId: row.memberId, batchId: id, action: "photo_update" },
            client
          );
        }
      }
    }

    await client.query(`UPDATE upload_batches SET status = 'committed', committed_at = now() WHERE id = $1`, [id]);
    await client.query("COMMIT");

    if (batch.photo_extract_dir) {
      fs.rmSync(batch.photo_extract_dir, { recursive: true, force: true });
    }

    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    await pool.query(`UPDATE upload_batches SET status = 'failed' WHERE id = $1`, [id]);
    next(e);
  } finally {
    client.release();
  }
});
