import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminSessionContext } from "./AdminSessionContext";
import { ApiError } from "../shared/api";

export default function AdminLoginPage() {
  const { login } = useAdminSessionContext();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // 비밀번호까지 맞았는데 2단계 인증(TOTP)이 켜져 있는 계정이면, 서버가 로그인을
  // 완료시키지 않고 needsTotp만 돌려준다 — 그때 코드 입력 단계로 넘어간다.
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(username.trim(), password, needsTotp ? totpCode.trim() : undefined);
      if (result.ok) {
        navigate("/admin/dashboard", { replace: true });
      } else if (result.needsTotp) {
        setNeedsTotp(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "로그인 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-slate-500 text-sm">아산시공무원노동조합</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">관리자 로그인</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-2xl shadow-sm p-6">
          {!needsTotp ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">아이디</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">인증앱 6자리 코드</label>
              <input
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="000000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-slate-400 mt-1.5">
                {username} 계정의 인증앱(Google Authenticator 등)에 표시된 코드를 입력해주세요.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNeedsTotp(false);
                  setTotpCode("");
                  setError(null);
                }}
                className="text-xs text-slate-400 underline mt-2"
              >
                아이디/비밀번호 다시 입력
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 text-white font-semibold py-2.5 disabled:opacity-60"
          >
            {submitting ? "확인 중..." : needsTotp ? "인증하고 로그인" : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
