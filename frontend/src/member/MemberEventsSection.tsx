import { useEffect, useState } from "react";
import { api, ApiError } from "../shared/api";

interface UnionEvent {
  id: number;
  title: string;
  description: string | null;
  status: "open" | "closed";
  has_image: boolean;
  applied: boolean;
}

/** 노조 행사 참여 — 관리자가 등록한 조합사업(이벤트)을 보여주고, 로그인된 본인 정보로 즉시 참여 신청한다. */
export default function MemberEventsSection() {
  const [events, setEvents] = useState<UnionEvent[] | null>(null);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: UnionEvent[] }>("/member/events")
      .then((data) => setEvents(data.items))
      .catch(() => setEvents([]));
  }, []);

  async function handleApply(id: number) {
    setError(null);
    setApplyingId(id);
    try {
      await api.post(`/member/events/${id}/apply`);
      setEvents((prev) => prev && prev.map((e) => (e.id === id ? { ...e, applied: true } : e)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "신청 중 오류가 발생했습니다.");
    } finally {
      setApplyingId(null);
    }
  }

  if (!events || events.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-bold text-slate-700 mb-2 px-1">노조 행사 참여</h3>
      {error && <p className="text-xs text-red-600 px-1 mb-2">{error}</p>}
      <div className="space-y-3">
        {events.map((event) => (
          <div key={event.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {event.has_image && (
              <img
                src={`/api/member/events/${event.id}/image`}
                alt={event.title}
                className="w-full aspect-[4/3] object-cover"
              />
            )}
            <div className="p-4">
              <p className="font-semibold text-slate-900 mb-1">{event.title}</p>
              {event.description && (
                <p className="text-xs text-slate-500 whitespace-pre-wrap mb-3">{event.description}</p>
              )}
              {event.applied ? (
                <span className="inline-block rounded-lg bg-green-50 text-green-700 text-sm font-medium px-4 py-2">
                  참여 완료
                </span>
              ) : event.status !== "open" ? (
                <span className="inline-block rounded-lg bg-slate-100 text-slate-400 text-sm font-medium px-4 py-2">
                  마감
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleApply(event.id)}
                  disabled={applyingId === event.id}
                  className="rounded-lg bg-blue-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                >
                  {applyingId === event.id ? "처리 중..." : "참여하기"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
