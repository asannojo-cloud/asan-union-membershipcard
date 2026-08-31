import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../shared/api";

interface EventItem {
  id: number;
  title: string;
  description: string | null;
  status: "open" | "closed";
  has_image: boolean;
  applicant_count: number;
  created_at: string;
}

export default function EventsListPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  // null이면 폼 닫힘, "create"면 새 이벤트 등록, 숫자면 그 id의 이벤트를 수정 중.
  const [formMode, setFormMode] = useState<"create" | number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const data = await api.get<{ items: EventItem[] }>("/admin/events");
    setEvents(data.items);
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setFormMode(null);
    setTitle("");
    setDescription("");
    setImage(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreateForm() {
    resetForm();
    setFormMode("create");
  }

  function openEditForm(ev: EventItem) {
    setFormMode(ev.id);
    setTitle(ev.title);
    setDescription(ev.description ?? "");
    setImage(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("description", description);
      if (image) form.append("image", image);

      if (formMode === "create") {
        await api.post("/admin/events", form);
      } else if (typeof formMode === "number") {
        await api.put(`/admin/events/${formMode}`, form);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(ev: EventItem) {
    await api.put(`/admin/events/${ev.id}`, { status: ev.status === "open" ? "closed" : "open" });
    await load();
  }

  async function handleDelete(ev: EventItem) {
    if (!confirm(`"${ev.title}" 이벤트를 삭제하시겠습니까? 신청 내역도 함께 삭제됩니다.`)) return;
    await api.delete(`/admin/events/${ev.id}`);
    await load();
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">조합사업 관리</h1>
        <button
          type="button"
          onClick={() => (formMode === "create" ? resetForm() : openCreateForm())}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2"
        >
          {formMode === "create" ? "취소" : "+ 새 이벤트 등록"}
        </button>
      </div>

      {formMode !== null && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 mb-6 space-y-4">
          <p className="text-sm font-semibold text-slate-700">
            {formMode === "create" ? "새 이벤트 등록" : "이벤트 수정"}
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">이벤트명</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 영화나눔행사"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">안내 내용</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="행사 일시, 장소, 대상 등"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              전단지 이미지 {typeof formMode === "number" ? "(변경하려면 새로 선택, 안 하면 기존 이미지 유지)" : "(선택)"}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {submitting ? "저장 중..." : formMode === "create" ? "등록" : "저장"}
            </button>
            <button type="button" onClick={resetForm} className="text-sm text-slate-500 underline">
              취소
            </button>
          </div>
        </form>
      )}

      {events === null ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 이벤트가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="bg-white rounded-2xl shadow-sm p-5 flex items-start gap-4">
              {ev.has_image && (
                <img
                  src={`/api/admin/events/${ev.id}/image`}
                  alt={ev.title}
                  className="w-16 h-16 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-slate-900">{ev.title}</p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      ev.status === "open" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {ev.status === "open" ? "신청가능" : "마감"}
                  </span>
                </div>
                {ev.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{ev.description}</p>}
                <div className="flex items-center gap-3 text-xs">
                  <Link to={`/admin/events/${ev.id}`} className="text-blue-700 font-medium underline">
                    신청자 {ev.applicant_count}명 보기
                  </Link>
                  <button type="button" onClick={() => openEditForm(ev)} className="text-slate-500 underline">
                    수정
                  </button>
                  <button type="button" onClick={() => handleToggleStatus(ev)} className="text-slate-500 underline">
                    {ev.status === "open" ? "마감하기" : "다시 열기"}
                  </button>
                  <button type="button" onClick={() => handleDelete(ev)} className="text-red-600 underline">
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
