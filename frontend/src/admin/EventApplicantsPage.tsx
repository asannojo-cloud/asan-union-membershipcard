import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../shared/api";

interface Applicant {
  memberId: string;
  name: string | null;
  phone: string | null;
  appliedAt: string;
}

function formatPhone(normalized: string | null): string {
  if (!normalized) return "-";
  if (normalized.length === 11) return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`;
  if (normalized.length === 10) return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  return normalized;
}

export default function EventApplicantsPage() {
  const { eventId } = useParams<{ eventId: string }>();
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
      <h1 className="text-xl font-bold text-slate-900 mb-1">{data.event.title}</h1>
      <p className="text-sm text-slate-500 mb-6">신청자 {data.applicants.length}명</p>

      {data.applicants.length === 0 ? (
        <p className="text-sm text-slate-400">아직 신청한 회원이 없습니다.</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left font-medium px-4 py-3">회원번호</th>
                <th className="text-left font-medium px-4 py-3">이름</th>
                <th className="text-left font-medium px-4 py-3">휴대폰번호</th>
                <th className="text-left font-medium px-4 py-3">신청일시</th>
              </tr>
            </thead>
            <tbody>
              {data.applicants.map((a) => (
                <tr key={a.memberId} className="border-t border-slate-100">
                  <td className="px-4 py-3">{a.memberId}</td>
                  <td className="px-4 py-3">{a.name}</td>
                  <td className="px-4 py-3">{formatPhone(a.phone)}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(a.appliedAt).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
