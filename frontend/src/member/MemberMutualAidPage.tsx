import { useState } from "react";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

const USAGE_STEPS = [
  "임종시 1800-4446 (장례희망 24시간 콜센터 연락)",
  "아산시청 장례서비스 이용 신청 및 지원내용 협의 (장례 준비단계에 신청해야 원활한 지원가능)",
  "고객 지정 장소로 장례지도사가 최장 2시간 이내 긴급 출동(전국 가능, 제주도 포함)",
  "지원 후, '장례서비스 제공 확인서' 내용 확인 후 서명",
];

// 대체서비스: 장례도우미를 몇 명 이용하느냐에 따라 그 차액만큼 아래 항목 중 하나를 고를 수 있다.
const ALT_SERVICE_GROUPS = [
  {
    title: "장례도우미 4명 중 3명만 이용하는 경우 (항목 중 택1)",
    options: ["근조 화환 바구니 (2EA)", "근조 3단 꽃 화환", "빈소용품 (위패, 혼백, 예단, 향, 초 등)", "접대용품 100인분 추가"],
  },
  {
    title: "장례도우미 4명 중 2명만 이용하는 경우 (항목 중 택1)",
    options: ["관내 이송 차량 지원 (고인운구)", "근조 3단 꽃 화환, 헌화 50송이", "저마 가진수의", "접대용품 200인분 추가"],
  },
  {
    title: "장례도우미 4명 중 1명만 이용하는 경우 (항목 중 택1)",
    options: ["고급 진공 유골함", "대마 가진수의"],
  },
  {
    title: "장례도우미 이용 안 하는 경우 (항목 중 택1)",
    options: ["장의차량 (5인승 고급리무진, 편도 150km)", "장의차량 (35인승 이상 장의버스, 왕복 150km)"],
  },
];

function CityFuneralServiceDetail() {
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-4 text-xs">
      <div className="space-y-2">
        <InfoLine label="대상" value="아산시 소속 직원 (공무원, 공무직, 시의원, 실무수습, 청원경찰, 1년 이상 기간제, 공중보건의, 시립합창단원 등)" />
        <InfoLine label="기간" value="2026.1.1. ~ 2026.12.31." />
        <InfoLine
          label="지원범위"
          value="본인, 배우자, 자녀, 부모(배우자의 부모 포함) — 단일 지원대상 장례에 지원대상자가 복수일 경우 중복지원 불가"
        />
        <InfoLine label="운영업체" value="장례희망" />
      </div>

      <a
        href="tel:1800-4446"
        className="block text-center bg-amber-50 border border-amber-200 rounded-lg py-2 text-amber-700 font-semibold"
      >
        임종시 연락 · 1800-4446 (24시간 콜센터)
      </a>

      <div>
        <p className="font-bold text-slate-700 mb-2">이용방법</p>
        <div className="space-y-2">
          {USAGE_STEPS.map((step, i) => (
            <div key={i} className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold">
                {i + 1}
              </span>
              <p className="text-slate-600">{step}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 font-bold text-red-500">
          ※ "신청주의"로 장례 이후 소급하여 지원불가
        </p>
      </div>

      <div>
        <p className="font-bold text-slate-700 mb-1">지원내용</p>
        <p className="text-slate-400 mb-2">※ 지원내용의 금액은 총무과에서 상조업체로 지급합니다.</p>

        <div className="space-y-3">
          <div>
            <p className="font-semibold text-slate-700 mb-1">기본 서비스</p>
            <ul className="list-disc pl-4 space-y-1 text-slate-600">
              <li>장례지도사 1명 이용 / 장례운영상담, 장례예법, 제례안내</li>
              <li>접대용품(식기, 접시, 수저, 젓가락 등) 200인분 지원</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-700 mb-1">선택서비스</p>
            <ul className="list-disc pl-4 space-y-1 text-slate-600">
              <li>장례도우미 4명 이용 — 2일×2명 또는 1일×4명 (1일 10시간 기준)</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-700 mb-1.5">대체서비스</p>
            <div className="space-y-2.5">
              {ALT_SERVICE_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="text-slate-500 mb-1">{group.title}</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                    {group.options.map((opt) => (
                      <li key={opt}>{opt}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium mr-1.5 align-top">{label}</span>
      <span className="text-slate-600">{value}</span>
    </p>
  );
}

export default function MemberMutualAidPage() {
  const [cityServiceOpen, setCityServiceOpen] = useState(false);
  const [supplyServiceOpen, setSupplyServiceOpen] = useState(false);
  const [flagRentalOpen, setFlagRentalOpen] = useState(false);

  return (
    <div className="px-6 pt-8 max-w-sm mx-auto text-sm text-slate-600 leading-relaxed">
      <h2 className="text-lg font-bold text-slate-900 mb-4">아산시청 공무원 상조서비스</h2>

      {/* 문의 전화번호가 페이지 맨 아래에 있어서 스크롤해야만 보인다는 의견이 있어 맨 위로 옮김 —
          급하게 연락해야 할 수도 있는 정보라 한 화면 안에 바로 보이는 게 중요하다. */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <a
          href="tel:041-540-2667"
          className="flex flex-col items-center justify-center gap-1 bg-white rounded-2xl shadow-sm py-3 px-2 active:bg-slate-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2Z" />
            </svg>
          </span>
          <span className="text-center">
            <span className="block text-[11px] text-slate-400">노동조합 문의</span>
            <span className="block text-sm font-semibold text-slate-900">041-540-2667</span>
          </span>
        </a>
        <a
          href="tel:041-540-2225"
          className="flex flex-col items-center justify-center gap-1 bg-white rounded-2xl shadow-sm py-3 px-2 active:bg-slate-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2Z" />
            </svg>
          </span>
          <span className="text-center">
            <span className="block text-[11px] text-slate-400">총무과 문의</span>
            <span className="block text-sm font-semibold text-slate-900">041-540-2225</span>
          </span>
        </a>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h3 className="inline-block rounded-md bg-slate-600 px-2.5 py-1 text-sm font-bold text-white mb-1.5">
          지원대상
        </h3>
        <p>본인, 배우자, 자녀, 부모(배우자의 부모 포함)</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 mt-4 space-y-4">
        <div>
          <h3 className="inline-block rounded-md bg-slate-600 px-2.5 py-1 text-sm font-bold text-white mb-1.5">
            지원 내용
          </h3>
          <p className="text-xs font-semibold text-red-500">
            ※ 총무과에서 지원하는 아산시청 직원장례서비스는 신청하지 않으면 혜택이 없어지므로 우선 신청하시기 바랍니다.
          </p>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <p className="font-medium text-slate-800 mb-1.5">가. 아산시청 직원장례서비스</p>
          <button
            type="button"
            onClick={() => setCityServiceOpen((v) => !v)}
            className="w-full flex items-center justify-between text-left rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5"
          >
            <span className="font-medium text-slate-800">신청 안내 및 지원 내용</span>
            <ChevronIcon open={cityServiceOpen} />
          </button>
          {cityServiceOpen && <CityFuneralServiceDetail />}
        </div>

        <div className="pt-4 border-t border-slate-100">
          <p className="font-medium text-slate-800 mb-1.5">나. 아공노 상조지원서비스</p>
          <button
            type="button"
            onClick={() => setSupplyServiceOpen((v) => !v)}
            className="w-full flex items-center justify-between text-left rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5"
          >
            <span className="font-medium text-slate-800">상조물품 또는 10만원 (택 1)</span>
            <ChevronIcon open={supplyServiceOpen} />
          </button>
          {supplyServiceOpen && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
              <div>
                <p className="text-slate-600">1) 상조물품 (150인분 * 2박스)</p>
                <img
                  src="/mutual-aid/union-supplies.png"
                  alt="아공노 상조물품 구성 (종이컵, 나무젓가락, 세팅박스 등)"
                  className="mt-2 w-full rounded-lg border border-slate-200"
                />
              </div>
              <p className="text-slate-600">2) 10만원</p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-100">
          <p className="font-medium text-slate-800 mb-1.5">다. 공통지원서비스 (근조기)</p>
          <button
            type="button"
            onClick={() => setFlagRentalOpen((v) => !v)}
            className="w-full flex items-center justify-between text-left rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5"
          >
            <span className="font-medium text-slate-800">아산시청 및 아공노 근조기 모두 지원</span>
            <ChevronIcon open={flagRentalOpen} />
          </button>
          {flagRentalOpen && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
              <div>
                <p className="text-slate-600">1) 아산시청</p>
                <p className="pl-3 text-slate-500">총무과 방문 수령</p>
              </div>
              <div>
                <p className="text-slate-600">2) 아산시공무원노동조합</p>
                <p className="pl-3 text-slate-500">아공노 사무실 방문 수령 (대의원)</p>
                <img
                  src="/mutual-aid/mourning-flag.jpg"
                  alt="아산시공무원노동조합 조기"
                  className="mt-2 w-32 rounded-lg border border-slate-200 mx-auto block"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                ※ 아산시 관내 장례식장인 경우, 장례식장에 비치되어 있으니 우선 해당 장례식장에 문의 바랍니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
