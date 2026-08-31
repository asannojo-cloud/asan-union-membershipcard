import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../shared/api";

interface Applicant {
  memberId: string;
  name: string | null;
  phone: string | null;
  appliedAt: string;
  comment: string | null;
  status: "confirmed" | "waitlisted";
}

function formatPhone(normalized: string | null): string {
  if (!normalized) return "-";
  if (normalized.length === 11) return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`;
  if (normalized.length === 10) return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  return normalized;
}

export default function EventApplicantsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<{ event: { id: number; title: string }; applicants: Applicant[] } | null>(null);

  useEffect(() => {
    api
      .get<{ event: { id: number; title: string }; applicants: Applicant[] }>(`/admin/events/${eventId}/applications`)
      .then(setData);
  }, [eventId]);

  if (!data) return <p className="text-sm text-slate-400">불러오는 중...</p>;

  return (
    <div className="max-w-2xl">
      <Link to="/admin/events" className="text-sm text-blue-700 underline mb-3 inline-block">
        ← 조합사업 목록으로
      </Link>
      <div className="flex items-center justify-between mb-1 gap-3">
        <button
          type="button"
          onClick={() => navigate("/admin/events", { state: { openEditId: data.event.id } })}
          className="text-xl font-bold text-slate-900 underline decoration-slate-300 hover:decoration-slate-500 text-left"
          title="클릭하면 이 사업 수정 화면으로 이동합니다"
        >
          {data.event.title}
        </button>
        {data.applicants.length > 0 && (
          <a
            href={`/api/admin/events/${eventId}/applications/excel`}
            className="shrink-0 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
          >
            ⬇ 엑셀 다운로드
          </a>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">신청자 {data.applicants.length}명</p>

      {data.applicants.length === 0 ? (
        <p className="text-sm text-slate-400">아직 신청한 회원이 없습니다.</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left font-medium px-4 py-3">회원번호</th>
                <th className="text-left font-medium px-4 py-3">이름</th>
                <th className="text-left font-medium px-4 py-3">휴대폰번호</th>
                <th className="text-left font-medium px-4 py-3">신청일시</th>
                <th className="text-left font-medium px-4 py-3">상태</th>
                <th className="text-left font-medium px-4 py-3">신청사유</th>
              </tr>
            </thead>
            <tbody>
              {data.applicants.map((a) => (
                <tr key={a.memberId} className="border-t border-slate-100">
                  <td className="px-4 py-3">{a.memberId}</td>
                  <td className="px-4 py-3">{a.name}</td>
                  <td className="px-4 py-3">{formatPhone(a.phone)}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(a.appliedAt).toLocaleString("ko-KR")}</td>
                  <td className="px-4 py-3">
                    {a.status === "waitlisted" ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        대기
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                        확정
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-pre-wrap max-w-xs">{a.comment || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
