import { useState, type FormEvent } from "react";
import { api, ApiError } from "../shared/api";
import { useAdminSessionContext } from "./AdminSessionContext";

type SetupState = { secret: string; qrCodeDataUrl: string } | null;

export default function AdminSecurityPage() {
  const { admin, refresh } = useAdminSessionContext();
  const [setup, setSetup] = useState<SetupState>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleStartSetup() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await api.post<{ secret: string; qrCodeDataUrl: string }>("/admin/auth/totp/setup");
      setSetup(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "설정을 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSetup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/admin/auth/totp/verify-setup", { code });
      setSetup(null);
      setCode("");
      setNotice("2단계 인증이 활성화되었습니다. 다음 로그인부터 인증앱 코드가 필요합니다.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "인증에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/admin/auth/totp/disable", { code: disableCode });
      setDisableCode("");
      setNotice("2단계 인증을 비활성화했습니다.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "비활성화에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!admin) return null;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-slate-900 mb-1">보안 설정</h1>
      <p className="text-sm text-slate-500 mb-6">{admin.username} 계정의 2단계 인증(OTP)을 관리합니다.</p>

      {notice && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
      )}

      {admin.totpEnabled ? (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <p className="font-semibold text-slate-800">2단계 인증 사용 중</p>
          </div>
          <p className="text-sm text-slate-500">
            비활성화하려면 현재 인증앱에 표시된 6자리 코드를 입력해주세요. (탈취된 세션이 임의로 끌 수 없도록,
            비활성화도 코드 확인이 필요합니다.)
          </p>
          <form onSubmit={handleDisable} className="flex gap-2">
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
            >
              비활성화
            </button>
          </form>
        </div>
      ) : setup ? (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Google Authenticator, Authy 등 인증앱으로 아래 QR코드를 스캔하거나, 코드를 못 읽으면 아래 키를 직접
            입력해주세요.
          </p>
          <img src={setup.qrCodeDataUrl} alt="2단계 인증 QR 코드" className="mx-auto w-48 h-48" />
          <p className="text-xs text-center text-slate-400 break-all font-mono">{setup.secret}</p>
          <form onSubmit={handleConfirmSetup} className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">인증앱에 뜬 6자리 코드 입력</label>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoFocus
                placeholder="000000"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
              >
                확인하고 활성화
              </button>
            </div>
          </form>
          <button
            type="button"
            onClick={() => setSetup(null)}
            className="text-xs text-slate-400 underline"
          >
            취소
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <p className="font-semibold text-slate-800">2단계 인증 사용 안 함</p>
          </div>
          <p className="text-sm text-slate-500">
            아이디와 비밀번호 외에, 인증앱(Google Authenticator 등)에서 매번 바뀌는 6자리 코드를 추가로 확인해
            로그인 보안을 강화합니다. 1888명 규모 실사용자 개인정보를 다루는 계정이라 설정을 권장합니다.
          </p>
          <button
            type="button"
            onClick={handleStartSetup}
            disabled={busy}
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
          >
            {busy ? "준비 중..." : "2단계 인증 설정 시작"}
          </button>
        </div>
      )}
    </div>
  );
}
