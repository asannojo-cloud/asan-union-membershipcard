import { useEffect, useState } from "react";
import { api, ApiError } from "../shared/api";

interface UnionEvent {
  id: number;
  title: string;
  description: string | null;
  status: "open" | "closed";
  has_image: boolean;
  application_prompt: string;
  image_position_y: number;
  capacity: number | null;
  my_status: "confirmed" | "waitlisted" | null;
}

/** 노조 행사 참여 — 관리자가 등록한 조합사업(이벤트)을 보여주고, 로그인된 본인 정보로 참여 신청/취소한다. */
export default function MemberEventsSection() {
  const [events, setEvents] = useState<UnionEvent[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [applyFormId, setApplyFormId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: UnionEvent[] }>("/member/events")
      .then((data) => setEvents(data.items))
      .catch(() => setEvents([]));
  }, []);

  function openApplyForm(event: UnionEvent) {
    // 관리자가 "없음"으로 설정한 이벤트는 입력창 없이 바로 신청 처리한다.
    if (event.application_prompt === "없음") {
      handleApply(event.id, null);
      return;
    }
    setError(null);
    setComment("");
    setApplyFormId(event.id);
  }

  async function handleApply(id: number, commentValue: string | null) {
    if (commentValue !== null && !commentValue.trim()) return;
    setError(null);
    setBusyId(id);
    try {
      const result = await api.post<{ ok: true; waitlisted: boolean }>(
        `/member/events/${id}/apply`,
        commentValue !== null ? { comment: commentValue.trim() } : undefined
      );
      const newStatus = result.waitlisted ? "waitlisted" : "confirmed";
      setEvents((prev) => prev && prev.map((e) => (e.id === id ? { ...e, my_status: newStatus } : e)));
      setApplyFormId(null);
      setComment("");
      if (result.waitlisted) {
        alert("정원이 마감되어 대기자로 접수되었습니다. 자리가 나면 순서대로 확정 처리됩니다.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "신청 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(id: number) {
    if (!confirm("신청을 취소하시겠습니까?")) return;
    setError(null);
    setBusyId(id);
    try {
      await api.delete(`/member/events/${id}/apply`);
      setEvents((prev) => prev && prev.map((e) => (e.id === id ? { ...e, my_status: null } : e)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "취소 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  if (!events || events.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-bold text-slate-700 mb-2 px-1">노조 행사 참여</h3>
      {error && <p className="text-xs text-red-600 px-1 mb-2">{error}</p>}
      <div className="space-y-3">
        {events.map((event) => {
          const expanded = expandedId === event.id;
          return (
            <div key={event.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {event.has_image && (
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : event.id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-500 border-b border-slate-100"
                >
                  <span>전단지 이미지 {expanded ? "접기" : "펼쳐보기"}</span>
                  <svg
                    viewBox="0 0 24 24"
                    className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              )}
              {event.has_image && expanded && (
                <img
                  src={`/api/member/events/${event.id}/image`}
                  alt={event.title}
                  className="w-full aspect-[4/3] object-cover"
                  style={{ objectPosition: `50% ${event.image_position_y}%` }}
                />
              )}
              <div className="p-4">
                <p className="font-semibold text-slate-900 mb-1">{event.title}</p>
                {event.description && (
                  <p className="text-xs text-slate-500 whitespace-pre-wrap mb-3">{event.description}</p>
                )}

                {event.my_status !== null ? (
                  <div className="flex items-center gap-2">
                    {event.my_status === "waitlisted" ? (
                      <span className="inline-block rounded-lg bg-amber-50 text-amber-700 text-sm font-medium px-4 py-2">
                        대기 중
                      </span>
                    ) : (
                      <span className="inline-block rounded-lg bg-green-50 text-green-700 text-sm font-medium px-4 py-2">
                        참여 완료
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCancel(event.id)}
                      disabled={busyId === event.id}
                      className="text-xs text-slate-400 underline disabled:opacity-50"
                    >
                      {busyId === event.id ? "취소 중..." : "취소하기"}
                    </button>
                  </div>
                ) : event.status !== "open" ? (
                  <span className="inline-block rounded-lg bg-slate-100 text-slate-400 text-sm font-medium px-4 py-2">
                    마감
                  </span>
                ) : applyFormId === event.id ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-600">{event.application_prompt}</label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="내용을 입력해주세요."
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApply(event.id, comment)}
                        disabled={busyId === event.id || !comment.trim()}
                        className="rounded-lg bg-blue-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                      >
                        {busyId === event.id ? "처리 중..." : "제출"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setApplyFormId(null)}
                        className="text-sm text-slate-500 underline"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openApplyForm(event)}
                    className="rounded-lg bg-blue-700 text-white text-sm font-medium px-4 py-2"
                  >
                    참여하기
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
