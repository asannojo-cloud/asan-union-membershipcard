import MemberEventsSection from "./MemberEventsSection";

// 협약 아이콘 — 악수 이모티콘.
function AgreementIcon() {
  return <span className="text-xl leading-none">🤝</span>;
}

// 봉고차(캡오버 소형 트럭) 형태의 차량 아이콘.
function VanIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16v-5a1 1 0 0 1 1-1h1.8L9 6.5h9.5a1.5 1.5 0 0 1 1.5 1.5V16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.5V16" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.6 17h6.8" />
    </svg>
  );
}

// 로그인한 조합원에게만 안내하는 제휴/서비스 링크. 추가하려면 이 배열에 항목만 더하면 된다.
const MEMBER_SERVICES = [
  {
    label: "협약기관 검색",
    url: "https://partners.asancityunion.com",
    icon: <AgreementIcon />,
  },
  {
    label: "차량대여사업",
    url: "https://carrent.asancityunion.com",
    icon: <VanIcon />,
  },
];

export default function MemberHelpPage() {
  return (
    <div className="px-6 pt-8 max-w-sm mx-auto text-sm text-slate-600 leading-relaxed">
      <h2 className="text-lg font-bold text-slate-900 mb-4">조합원복지사업</h2>

      <MemberEventsSection />

      <div className="space-y-2">
        {MEMBER_SERVICES.map((service) => (
          <a
            key={service.url}
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white rounded-2xl shadow-sm p-5 active:bg-slate-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700 shrink-0">
              {service.icon}
            </span>
            <span className="flex-1 text-base font-semibold text-slate-900">{service.label}</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-slate-300 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
            </svg>
          </a>
        ))}
      </div>

      <h3 className="text-sm font-bold text-slate-700 mt-6 mb-2 px-1">문의</h3>
      <a
        href="tel:041-540-2667"
        className="flex items-center gap-3 bg-white rounded-2xl shadow-sm p-5 active:bg-slate-50"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2Z" />
          </svg>
        </span>
        <span>
          <span className="block text-xs text-slate-400">문의전화</span>
          <span className="block text-base font-semibold text-slate-900">041-540-2667</span>
        </span>
      </a>
    </div>
  );
}
