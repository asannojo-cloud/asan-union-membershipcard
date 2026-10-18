import { useMemberSessionContext } from "./MemberSessionContext";
import { photoUrl } from "../shared/api";

function formatDate(iso: string): string {
  return iso.replaceAll("-", ".");
}

export default function MemberCardPage() {
  const { member, photoNonce } = useMemberSessionContext();
  if (!member) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-md border border-slate-200 p-6 flex flex-col items-center">
        <h1 className="text-[1.35rem] font-bold text-slate-900 tracking-wide mb-4">조합원증</h1>

        {/* 세로형 증명사진 비율(3:4) 프레임 */}
        <div className="w-40 aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
          {member.hasPhoto ? (
            <img
              key={photoNonce}
              src={`${photoUrl("/member/me/photo")}?v=${photoNonce}`}
              alt="회원 사진"
              className="w-full h-full object-cover"
            />
          ) : (
            <svg viewBox="0 0 24 24" className="w-16 h-16 text-slate-300" fill="currentColor">
              <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v2h16v-2c0-2.76-3.58-5-8-5z" />
            </svg>
          )}
        </div>

        <p className="mt-6 text-xl font-bold text-slate-900 tracking-wide">{member.name}</p>
        <p className="mt-1 text-slate-500">{formatDate(member.birthDate)}</p>

        <p className="mt-6 text-sm text-slate-400">발급일 {formatDate(member.issueDate)}</p>

        <div className="mt-6 pt-4 border-t border-slate-100 w-full flex items-center justify-center gap-1.5">
          <img src="/union-logo.png" alt="" className="h-5 w-5 object-contain" />
          <p className="text-sm font-semibold text-slate-700">아산시공무원노동조합</p>
        </div>
      </div>
    </div>
  );
}
