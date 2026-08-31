import { NavLink, Outlet, Navigate, Link } from "react-router-dom";
import { useMemberSessionContext } from "./MemberSessionContext";

// 신분증/조합원증 아이콘 — 이모티콘은 기기/폰트에 따라 카드처럼 안 보일 수 있어
// 직접 그린 아이콘으로 대체 (사진칸 + 정보줄이 있는 카드 모양).
function IdCardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <rect x="3" y="5" width="18" height="14" rx="2" strokeLinejoin="round" />
      <circle cx="8" cy="11.5" r="2" />
      <path strokeLinecap="round" d="M5.5 16c.3-1.6 1.4-2.5 2.5-2.5s2.2.9 2.5 2.5" />
      <path strokeLinecap="round" d="M13.5 10h4M13.5 13h4M13.5 16h2.5" />
    </svg>
  );
}

const tabs = [
  { to: "/member/card", label: "조합원증", icon: <IdCardIcon /> },
  { to: "/member/help", label: "조합원복지사업", icon: "🎁" },
  { to: "/member/mutual-aid", label: "상조서비스", icon: "🕊️" },
];

export default function MemberLayout() {
  const { member, loading } = useMemberSessionContext();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">불러오는 중...</div>;
  }
  if (!member) {
    return <Navigate to="/member/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* 모바일(특히 PWA로 설치해 전체화면으로 쓸 때)에서는 상단 헤더가 상태표시줄(시간/와이파이/배터리)
          바로 밑에 붙어서 답답해 보인다는 의견이 있어, 모바일에서만 위쪽 여백을 넉넉히 준다.
          env(safe-area-inset-top)은 노치/상태표시줄이 있는 기기에서 그 높이만큼 추가로 확보해준다
          (index.html의 viewport-fit=cover가 있어야 값이 0이 아니게 적용됨). sm 이상(데스크톱/태블릿)에서는
          원래 여백으로 되돌린다. */}
      <header className="relative bg-blue-800 text-white pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:pt-3 font-semibold tracking-wide flex items-center justify-center gap-2">
        <img src="/union-logo.png" alt="" className="h-8 w-8 object-contain" />
        <span>아산시공무원노동조합</span>
        <Link
          to="/member/card"
          aria-label="홈으로 이동"
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full active:bg-blue-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />
          </svg>
        </Link>
      </header>

      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold tracking-tight ${
                isActive ? "text-blue-700" : "text-slate-500"
              }`
            }
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
