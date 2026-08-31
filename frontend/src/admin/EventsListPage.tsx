import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../shared/api";

interface EventItem {
  id: number;
  title: string;
  description: string | null;
  status: "open" | "closed";
  has_image: boolean;
  application_prompt: string;
  image_position_y: number;
  capacity: number | null;
  applicant_count: number;
  waitlisted_count: number;
  created_at: string;
}

// "없음"을 고르면 회원 화면에 입력창 자체가 뜨지 않고 바로 신청 처리된다.
const PROMPT_OPTIONS = ["신청사유", "아공노에 바란다", "신규시책", "없음"] as const;

export default function EventsListPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  // null이면 폼 닫힘, "create"면 새 이벤트 등록, 숫자면 그 id의 이벤트를 수정 중.
  const [formMode, setFormMode] = useState<"create" | number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [applicationPrompt, setApplicationPrompt] = useState<string>(PROMPT_OPTIONS[0]);
  const [imagePositionY, setImagePositionY] = useState(50);
  const [capacity, setCapacity] = useState("");
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [existingHasImage, setExistingHasImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const location = useLocation();
  const navigate = useNavigate();

  async function load() {
    try {
      const data = await api.get<{ items: EventItem[] }>("/admin/events");
      setEvents(data.items);
      return data.items;
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
      setEvents([]);
      return [];
    }
  }

  useEffect(() => {
    load().then((items) => {
      // 신청자 목록 화면에서 "이벤트명 클릭 → 수정" 으로 넘어온 경우, 그 이벤트의 수정 폼을 바로 연다.
      const openEditId = (location.state as { openEditId?: number } | null)?.openEditId;
      if (openEditId !== undefined) {
        const ev = items.find((e) => e.id === openEditId);
        if (ev) openEditForm(ev);
        navigate(location.pathname, { replace: true, state: null });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새로 선택한 파일의 미리보기를 만든다. helmet 기본 CSP의 img-src가 'self' data:까지만
  // 허용하고 blob:은 막고 있어서(2026-08-31 확인, 미리보기가 안 뜨던 원인) URL.createObjectURL
  // 대신 FileReader로 data: URL을 만든다.
  useEffect(() => {
    if (!image) {
      setImagePreviewUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreviewUrl(reader.result as string);
    reader.readAsDataURL(image);
    return () => reader.abort();
  }, [image]);

  function resetForm() {
    setFormMode(null);
    setTitle("");
    setDescription("");
    setApplicationPrompt(PROMPT_OPTIONS[0]);
    setImagePositionY(50);
    setCapacity("");
    setStatus("open");
    setImage(null);
    setExistingHasImage(false);
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
    setApplicationPrompt(ev.application_prompt || PROMPT_OPTIONS[0]);
    setImagePositionY(ev.image_position_y ?? 50);
    setCapacity(ev.capacity !== null ? String(ev.capacity) : "");
    setStatus(ev.status);
    setImage(null);
    setExistingHasImage(ev.has_image);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleToggleTopButton() {
    formMode !== null ? resetForm() : openCreateForm();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("description", description);
      form.append("applicationPrompt", applicationPrompt);
      form.append("imagePositionY", String(imagePositionY));
      form.append("capacity", capacity);
      if (image) form.append("image", image);

      if (formMode === "create") {
        await api.post("/admin/events", form);
      } else if (typeof formMode === "number") {
        form.append("status", status);
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

  async function handleDelete(ev: EventItem) {
    if (!confirm(`"${ev.title}" 이벤트를 삭제하시겠습니까? 신청 내역도 함께 삭제됩니다.`)) return;
    setListError(null);
    try {
      await api.delete(`/admin/events/${ev.id}`);
      await load();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  const previewSrc = imagePreviewUrl ?? (typeof formMode === "number" && existingHasImage ? `/api/admin/events/${formMode}/image` : null);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">조합사업 관리</h1>
        <button
          type="button"
          onClick={handleToggleTopButton}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2"
        >
          {formMode !== null ? "취소" : "+ 새 이벤트 등록"}
        </button>
      </div>

      {listError && <p className="text-sm text-red-600 mb-4">{listError}</p>}

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
              신청 시 요청할 문구 (직접 입력하거나 목록에서 선택)
            </label>
            <input
              value={applicationPrompt}
              onChange={(e) => setApplicationPrompt(e.target.value)}
              list="prompt-presets"
              placeholder="예: 신청사유"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              maxLength={200}
              required
            />
            <datalist id="prompt-presets">
              {PROMPT_OPTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <p className="text-xs text-slate-400 mt-1">
              {applicationPrompt === "없음"
                ? "\"없음\"으로 두면 회원 화면에 입력창 없이 바로 신청 처리됩니다."
                : "회원이 \"참여하기\"를 누르면 이 문구와 함께 필수 입력창이 나타납니다."}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              전단지 이미지 {typeof formMode === "number" ? "(변경하려면 새로 선택, 안 하면 기존 이미지 유지)" : "(선택)"}
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 px-4 py-2 text-sm text-slate-700 cursor-pointer">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" />
              </svg>
              {image ? image.name : "파일 선택"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>
          {previewSrc && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                회원 화면 미리보기 (아래 슬라이더로 잘리는 위치 조절)
              </label>
              <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100">
                <img
                  src={previewSrc}
                  alt="미리보기"
                  className="w-full h-full object-cover"
                  style={{ objectPosition: `50% ${imagePositionY}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={imagePositionY}
                onChange={(e) => setImagePositionY(Number(e.target.value))}
                className="w-full mt-2"
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>위쪽</span>
                <span>아래쪽</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">신청 정원 (선택)</label>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="비워두면 정원 제한 없음"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              정원을 채운 뒤 신청하는 회원은 대기자로 접수되고, 그 사실이 화면에 안내됩니다.
            </p>
          </div>
          {typeof formMode === "number" && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={status === "closed"}
                onChange={(e) => setStatus(e.target.checked ? "closed" : "open")}
                className="rounded border-slate-300"
              />
              마감 처리 (체크하면 회원이 더 이상 신청할 수 없습니다)
            </label>
          )}
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
                  style={{ objectPosition: `50% ${ev.image_position_y}%` }}
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
                {ev.capacity !== null && (
                  <p className="text-xs text-slate-400 mb-2">
                    정원 {ev.capacity}명 중 {ev.applicant_count - ev.waitlisted_count}명 신청
                    {ev.waitlisted_count > 0 && ` (대기 ${ev.waitlisted_count}명)`}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs">
                  <Link to={`/admin/events/${ev.id}`} className="text-blue-700 font-medium underline">
                    신청자 {ev.applicant_count}명 보기
                  </Link>
                  <button type="button" onClick={() => openEditForm(ev)} className="text-slate-500 underline">
                    수정 (마감/재오픈 포함)
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
