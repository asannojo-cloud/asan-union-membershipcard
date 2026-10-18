import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMemberSessionContext } from "./MemberSessionContext";
import { getErrorMessage } from "./useMemberSession";

type Step = "credentials" | "setPin" | "enterPin";

const PIN_PATTERN = "\\d{4}";

function PinInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type="password"
        inputMode="numeric"
        pattern={PIN_PATTERN}
        maxLength={4}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-2xl tracking-[0.6em] focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoComplete="off"
        required
      />
    </div>
  );
}

export default function MemberLoginPage() {
  const { login } = useMemberSessionContext();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("credentials");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login({ name: name.trim(), phone: phone.trim() });
      if (result.ok) {
        navigate("/member/card", { replace: true });
      } else if (result.needsPinSetup) {
        setStep("setPin");
      } else if (result.needsPin) {
        setStep("enterPin");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSetPin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPin !== newPinConfirm) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await login({ name: name.trim(), phone: phone.trim(), newPin, newPinConfirm });
      if (result.ok) {
        navigate("/member/card", { replace: true });
      } else {
        setError("설정 중 문제가 발생했습니다. 다시 시도해주세요.");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEnterPin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login({ name: name.trim(), phone: phone.trim(), pin });
      if (result.ok) {
        navigate("/member/card", { replace: true });
      } else {
        setError("로그인 중 문제가 발생했습니다. 다시 시도해주세요.");
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  function backToCredentials() {
    setStep("credentials");
    setError(null);
    setPin("");
    setNewPin("");
    setNewPinConfirm("");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/union-logo.png" alt="아산시공무원노동조합 로고" className="h-16 w-16 object-contain mx-auto mb-0.5" />
          <p className="text-slate-500 text-2xl">아산시공무원노동조합</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-4">모바일 조합원증</h1>
        </div>

        {step === "credentials" && (
          <form onSubmit={submitCredentials} className="space-y-4 bg-white rounded-2xl shadow-sm p-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">휴대폰번호</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-1234-5678"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="tel"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-700 text-white font-semibold py-2.5 disabled:opacity-60"
            >
              {submitting ? "확인 중..." : "다음"}
            </button>

            <p className="text-xs text-slate-400 text-center pt-1">
              등록하신 이름과 휴대폰번호로 본인 확인 후 로그인됩니다.
            </p>
          </form>
        )}

        {step === "setPin" && (
          <form onSubmit={submitSetPin} className="space-y-4 bg-white rounded-2xl shadow-sm p-6">
            <p className="text-sm text-slate-600">
              본인 확인이 완료됐습니다. 다음부터 사용할 <strong>4자리 비밀번호</strong>를 새로 설정해주세요.
            </p>
            <PinInput label="새 비밀번호 (숫자 4자리)" value={newPin} onChange={setNewPin} autoFocus />
            <PinInput label="새 비밀번호 확인" value={newPinConfirm} onChange={setNewPinConfirm} />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting || newPin.length !== 4 || newPinConfirm.length !== 4}
              className="w-full rounded-lg bg-blue-700 text-white font-semibold py-2.5 disabled:opacity-60"
            >
              {submitting ? "설정 중..." : "설정하고 로그인"}
            </button>
            <button type="button" onClick={backToCredentials} className="w-full text-xs text-slate-400 underline">
              처음으로
            </button>
          </form>
        )}

        {step === "enterPin" && (
          <form onSubmit={submitEnterPin} className="space-y-4 bg-white rounded-2xl shadow-sm p-6">
            <p className="text-sm text-slate-600">
              <strong>{name}</strong>님, 설정하신 4자리 비밀번호를 입력해주세요.
            </p>
            <PinInput label="비밀번호" value={pin} onChange={setPin} autoFocus />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting || pin.length !== 4}
              className="w-full rounded-lg bg-blue-700 text-white font-semibold py-2.5 disabled:opacity-60"
            >
              {submitting ? "로그인 중..." : "로그인"}
            </button>
            <button type="button" onClick={backToCredentials} className="w-full text-xs text-slate-400 underline">
              처음으로
            </button>
            <p className="text-xs text-slate-400 text-center pt-1">
              비밀번호를 잊으셨으면 아래 문의전화로 초기화를 요청해주세요.
            </p>
          </form>
        )}

        <p className="mt-4 text-[0.9rem] text-slate-400 text-center">
          문의전화{" "}
          <a href="tel:041-540-2667" className="text-slate-500 font-medium underline">
            041-540-2667
          </a>
        </p>
      </div>
    </div>
  );
}
