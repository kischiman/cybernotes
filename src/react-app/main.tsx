import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Camera,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  Folder,
  GripVertical,
  Eye,
  History,
  Home,
  LogOut,
  Mic,
  Pencil,
  Plus,
  Send,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import "./styles.css";

type Project = {
  id: string;
  title: string;
  goal: string | null;
  status: "active" | "completed";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type Protocol = {
  id: string;
  project_id: string;
  title: string;
  goal: string | null;
  intervention: string | null;
  metrics: string | null;
  deadline: string | null;
  status: "active" | "completed";
  created_at: string;
  updated_at: string;
  last_entry_at?: string | null;
  open_todo_count?: number;
  project_title?: string;
  project_started_at?: string | null;
};

type Photo = {
  id: string;
  entry_id: string;
  r2_url: string;
  caption: string | null;
  created_at: string;
};

type ProtocolCyclePhoto = {
  id: string;
  cycle_id: string;
  r2_url: string;
  caption: string | null;
  created_at: string;
};

type ProtocolCycle = {
  id: string;
  project_id: string;
  protocol_id: string | null;
  protocol_title: string;
  synthesis: string | null;
  notes: string | null;
  results: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  photos: ProtocolCyclePhoto[];
};

type Entry = {
  id: string;
  protocol_id: string;
  body: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  photos: Photo[];
};

type TodoAssignee = {
  assignee_id: string;
  person_id: string;
  name: string;
  role: string | null;
};

type Todo = {
  id: string;
  protocol_id: string;
  body: string;
  done: 0 | 1;
  due_date: string | null;
  recurrence: "one_off" | "recurring";
  recurrence_frequency: "daily" | "weekly" | "monthly" | null;
  recurrence_day: number | null;
  person_id: string | null;
  position: number | null;
  person_name?: string | null;
  person_role?: string | null;
  project_id?: string;
  project_title?: string;
  protocol_title?: string;
  created_at: string;
  updated_at: string;
  assignees: TodoAssignee[];
};

type Person = {
  id: string;
  project_id: string;
  directory_id: string | null;
  name: string;
  note: string | null;
  created_at: string;
};

type DirectoryPerson = {
  id: string;
  name: string;
  note: string | null;
  projects: string[];
  created_at: string;
  updated_at: string | null;
};

type CheckinSession = "morning" | "evening";

type CheckinTemplate = {
  id: string;
  session: CheckinSession;
  question: string;
  position: number;
  created_at: string;
  archived_at: string | null;
};

type CheckinAnswer = {
  id: string;
  entry_id: string;
  template_id: string;
  question_snapshot: string;
  answer: string | null;
  position: number;
};

type CheckinEntryBundle = {
  entry: {
    id: string;
    date: string;
    session: CheckinSession;
    created_at: string;
    updated_at: string;
  };
  answers: CheckinAnswer[];
};

type CheckinTemplatesBySession = Record<CheckinSession, CheckinTemplate[]>;
type CheckinEntriesBySession = Record<CheckinSession, CheckinEntryBundle | null>;

type Win = {
  id: string;
  body: string;
  project_id: string | null;
  project_title?: string | null;
  created_at: string;
  updated_at: string;
};

const RASCI_ROLES = [
  { value: "R", label: "Responsible" },
  { value: "A", label: "Accountable" },
  { value: "S", label: "Supportive" },
  { value: "C", label: "Consulted" },
  { value: "I", label: "Informed" },
];

const TODO_RECURRENCE_OPTIONS = [
  { value: "one_off", label: "One-off" },
  { value: "recurring", label: "Recurring" },
] as const;

const TODO_RECURRENCE_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);

function shortWeekday(value: number | null | undefined) {
  return WEEKDAY_OPTIONS.find((day) => day.value === value)?.label.slice(0, 3) || "";
}

function todoRecurrenceLabel(todo: Pick<Todo, "recurrence" | "recurrence_frequency" | "recurrence_day">) {
  if (todo.recurrence !== "recurring") return "One-off";
  if (todo.recurrence_frequency === "weekly") return `Weekly${shortWeekday(todo.recurrence_day) ? ` ${shortWeekday(todo.recurrence_day)}` : ""}`;
  if (todo.recurrence_frequency === "monthly") return `Monthly${todo.recurrence_day ? ` day ${todo.recurrence_day}` : ""}`;
  return "Daily";
}

function roleLabel(value: string | null | undefined) {
  return RASCI_ROLES.find((role) => role.value === value)?.label || "";
}

const GANTT_PROJECT_COLORS = ["#0066FF", "#00A36C", "#E85D04", "#7B2FBE", "#C9184A", "#0096C7", "#606C38", "#AE2012"];
const GANTT_MIN_DAY_WIDTH = 48;
const GANTT_MAX_DAY_WIDTH = 80;
const GANTT_VISIBLE_COLUMNS = 6;

function ganttColumnWidth() {
  return Math.min(
    GANTT_MAX_DAY_WIDTH,
    Math.max(GANTT_MIN_DAY_WIDTH, Math.floor(window.innerWidth / GANTT_VISIBLE_COLUMNS)),
  );
}

async function apiJson<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    window.location.href = "/auth/login";
    throw new Error("Redirecting to sign in");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  return (await response.json()) as T;
}

async function apiText(path: string) {
  const response = await fetch(path);
  if (response.status === 401) {
    window.location.href = "/auth/login";
    throw new Error("Redirecting to sign in");
  }
  if (!response.ok) throw new Error(response.statusText);
  return await response.text();
}

// Voice memos are meant to be short; auto-stop after this many seconds so a
// recording can't quietly grow past Gemini's inline-audio budget.
const MAX_RECORDING_SECONDS = 300;

// MediaRecorder emits WebM (Chrome) or MP4/AAC (Safari); Gemini's audio support
// is more reliable with WAV, so we decode whatever was recorded and re-encode it
// to 16 kHz mono 16-bit PCM WAV — a format Gemini accepts and that keeps short
// memos small (~32 KB/s).
async function recordingToWav(blob: Blob): Promise<Blob> {
  const AudioCtx: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void decodeCtx.close();
  }
  const targetRate = 16000;
  const length = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, length, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), targetRate);
}

// Encode mono float samples (-1..1) as a 16-bit PCM WAV blob.
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function useSafeId() {
  const { id } = useParams();
  if (!id) throw new Error("Missing route id");
  return id;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "No entries";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDueDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `due ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)}`;
}

function deadlineTone(value: string | null | undefined) {
  if (!value) return "";
  const today = new Date(`${localDateValue()}T00:00:00`);
  const due = new Date(`${value}T00:00:00`);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (Number.isNaN(diff)) return "";
  if (diff < 0) return "due-past";
  if (diff <= 3) return "due-soon";
  return "due-future";
}

function localDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function DeadlineBadge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <span className={`due-date ${deadlineTone(value)}`}>{formatDueDate(value)}</span>;
}

function localDateValue(date = new Date()) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : localDateValue();
}

function dateAtStart(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addDays(value: string, days: number) {
  const date = dateAtStart(value);
  date.setDate(date.getDate() + days);
  return localDateValue(date);
}

function daysBetween(start: string, end: string) {
  return Math.round((dateAtStart(end).getTime() - dateAtStart(start).getTime()) / 86_400_000);
}

function buildDateRange(start: string, end: string) {
  const total = Math.max(0, daysBetween(start, end));
  return Array.from({ length: total + 1 }, (_, index) => addDays(start, index));
}

function minDateString(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).map(String).sort()[0] || localDateValue();
}

function maxDateString(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).map(String).sort().at(-1) || localDateValue();
}

function formatGanttDay(value: string) {
  const date = dateAtStart(value);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return `${weekday} ${date.getDate()}`;
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const numeric = Number.parseInt(value, 16);
  const red = (numeric >> 16) & 255;
  const green = (numeric >> 8) & 255;
  const blue = numeric & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="error-banner">{message}</div>;
}

function Loading() {
  return <div className="muted pad">Loading</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

function BottomSheet({
  children,
  className = "",
  onClose,
  onSubmit,
}: {
  children: React.ReactNode;
  className?: string;
  onClose: () => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const touchStartY = useRef<number | null>(null);

  const startTouch = (event: React.TouchEvent) => {
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };
  const endTouch = (event: React.TouchEvent) => {
    const startY = touchStartY.current;
    const endY = event.changedTouches[0]?.clientY ?? startY;
    touchStartY.current = null;
    if (startY !== null && endY !== null && endY - startY > 80) onClose();
  };

  const content = (
    <>
      <div className="sheet-grabber" aria-hidden="true" />
      {children}
    </>
  );

  if (onSubmit) {
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <form
          className={`sheet ${className}`}
          onClick={(event) => event.stopPropagation()}
          onSubmit={onSubmit}
          onTouchEnd={endTouch}
          onTouchStart={startTouch}
        >
          {content}
        </form>
      </div>
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={`sheet ${className}`}
        onClick={(event) => event.stopPropagation()}
        onTouchEnd={endTouch}
        onTouchStart={startTouch}
      >
        {content}
      </div>
    </div>
  );
}

function IconButton({
  children,
  icon,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode }) {
  return (
    <button {...props} className={`button ${props.className || ""}`}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDone, 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return <div className="toast">{message}</div>;
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <button className="icon-only" type="button" onClick={() => navigate(-1)} aria-label="Back" title="Back">
      <ArrowLeft size={20} />
    </button>
  );
}

async function fetchActiveProtocolSummaries() {
  const { projects } = await apiJson<{ projects: Project[] }>("/api/projects?status=active");
  const pairs = await Promise.all(
    projects.map(async (project) => {
      const { protocols } = await apiJson<{ protocols: Protocol[] }>(`/api/projects/${project.id}/protocols`);
      return protocols
        .filter((protocol) => protocol.status === "active")
        .map((protocol) => ({ ...protocol, project_title: project.title }));
    }),
  );
  return pairs.flat().sort((left, right) => {
    if (!left.deadline && !right.deadline) return left.title.localeCompare(right.title);
    if (!left.deadline) return 1;
    if (!right.deadline) return -1;
    return left.deadline.localeCompare(right.deadline);
  });
}

// ============================================================
// Research — research a topic across four backends and draft a cited article.
// Ported from the SocialMediaAgent encyclopedia generator. Desktop gets a
// two-pane (list | article) layout; mobile falls back to a single column.
// ============================================================

type ArticleMode = "consensus" | "websearch" | "europepmc" | "gossip";

type Article = {
  id: string;
  title: string;
  tags: string[];
  consensus_body: string;
  websearch_body: string;
  europepmc_body: string;
  gossip_body: string;
  sources_consensus: string[];
  sources_websearch: string[];
  sources_europepmc: string[];
  sources_gossip: string[];
  prompt_consensus: string;
  prompt_websearch: string;
  prompt_europepmc: string;
  prompt_gossip: string;
  created_at: string | null;
  updated_at: string | null;
};

type ResearchResponse = { body: string; tags: string[]; sources: string[]; mode: ArticleMode; prompt: string };

const ARTICLE_MODES: { mode: ArticleMode; label: string; hint: string }[] = [
  { mode: "consensus", label: "Consensus", hint: "Peer-reviewed bias via Google grounding" },
  { mode: "europepmc", label: "Europe PMC", hint: "Peer-reviewed biomedical papers (DOI / PubMed)" },
  { mode: "websearch", label: "WebSearch", hint: "Open-web sources via Google grounding" },
  { mode: "gossip", label: "Gossip", hint: "The dramatic / viral angle" },
];

function modeBody(article: Article, mode: ArticleMode): string {
  return article[`${mode}_body` as const];
}

function modeSources(article: Article, mode: ArticleMode): string[] {
  return article[`sources_${mode}` as const];
}

function modePrompt(article: Article, mode: ArticleMode): string {
  return article[`prompt_${mode}` as const];
}

function articleHasContent(article: Article, mode: ArticleMode): boolean {
  return modeBody(article, mode).trim().length > 0 || modeSources(article, mode).length > 0;
}

function ResearchScreen() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(selectAfter?: string) {
    setLoading(true);
    setError(null);
    try {
      const { articles: next } = await apiJson<{ articles: Article[] }>("/api/articles");
      setArticles(next);
      setSelectedId((current) => selectAfter ?? current ?? next[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load articles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createArticle(event: React.FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    setError(null);
    try {
      const { article } = await apiJson<{ article: Article }>("/api/articles", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      setNewTitle("");
      await load(article.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create article");
    } finally {
      setCreating(false);
    }
  }

  function handleSaved(updated: Article) {
    setArticles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function handleDeleted(id: string) {
    setArticles((current) => current.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  const selected = useMemo(() => articles.find((item) => item.id === selectedId) ?? null, [articles, selectedId]);

  if (loading) return <Loading />;

  return (
    <section className="research-breakout">
      <header className="topbar compact">
        <BackButton />
        <div>
          <p className="eyebrow">Knowledge</p>
          <h1>Research</h1>
        </div>
      </header>
      <ErrorBanner message={error} />

      <div className="research-grid">
        <aside className="research-list">
          <form className="research-new" onSubmit={createArticle}>
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="New topic, e.g. BPC-157"
              aria-label="New article title"
            />
            <IconButton className="primary" type="submit" disabled={creating || !newTitle.trim()} icon={<Plus size={16} />}>
              {creating ? "Adding…" : "Add"}
            </IconButton>
          </form>
          {!articles.length ? (
            <Empty>No articles yet. Add a topic to research.</Empty>
          ) : (
            <ul className="research-list-items">
              {articles.map((article) => {
                const filled = ARTICLE_MODES.filter(({ mode }) => articleHasContent(article, mode)).length;
                return (
                  <li key={article.id}>
                    <button
                      type="button"
                      className={`research-list-item${article.id === selectedId ? " active" : ""}`}
                      onClick={() => setSelectedId(article.id)}
                    >
                      <span className="research-list-title">{article.title || "Untitled"}</span>
                      <span className="research-list-meta">
                        {filled ? `${filled}/4 researched` : "empty"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="research-main">
          {!selected ? (
            <Empty>Pick an article on the left, or add a new topic.</Empty>
          ) : (
            <ArticlePane key={selected.id} article={selected} onSaved={handleSaved} onDeleted={handleDeleted} />
          )}
        </div>
      </div>
    </section>
  );
}

function ArticlePane({
  article,
  onSaved,
  onDeleted,
}: {
  article: Article;
  onSaved: (article: Article) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Article>(article);
  const [activeMode, setActiveMode] = useState<ArticleMode>(
    ARTICLE_MODES.find(({ mode }) => articleHasContent(article, mode))?.mode ?? "consensus",
  );
  const [direction, setDirection] = useState("");
  const [researching, setResearching] = useState<ArticleMode | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(article);
  }, [article]);

  async function persist(next: Article) {
    setSaving(true);
    setError(null);
    try {
      const { article: saved } = await apiJson<{ article: Article }>(`/api/articles/${next.id}`, {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setDraft(saved);
      onSaved(saved);
      return saved;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save");
      throw saveError;
    } finally {
      setSaving(false);
    }
  }

  async function runResearch(mode: ArticleMode) {
    if (!draft.title.trim()) {
      setError("Give the article a title first");
      return;
    }
    setResearching(mode);
    setError(null);
    try {
      const result = await apiJson<ResearchResponse>("/api/articles/research", {
        method: "POST",
        body: JSON.stringify({ title: draft.title, prompt: direction, mode }),
      });
      const mergedTags = Array.from(new Set([...draft.tags, ...result.tags]));
      const next: Article = {
        ...draft,
        tags: mergedTags,
        [`${mode}_body`]: result.body,
        [`sources_${mode}`]: result.sources,
        [`prompt_${mode}`]: result.prompt ?? direction,
      };
      setActiveMode(mode);
      await persist(next);
    } catch (researchError) {
      setError(researchError instanceof Error ? researchError.message : "Research failed");
    } finally {
      setResearching(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${draft.title}"?`)) return;
    try {
      await apiJson(`/api/articles/${draft.id}`, { method: "DELETE" });
      onDeleted(draft.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete");
    }
  }

  const body = modeBody(draft, activeMode);
  const sources = modeSources(draft, activeMode);
  const usedPrompt = modePrompt(draft, activeMode);

  return (
    <article className="research-article">
      <div className="research-article-head">
        <input
          className="research-title-input"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          onBlur={() => {
            if (draft.title.trim() && draft.title !== article.title) void persist(draft);
          }}
          placeholder="Article title"
          aria-label="Article title"
        />
        <button type="button" className="button danger ghost" onClick={remove}>
          <Trash2 size={16} />
        </button>
      </div>

      <label className="research-tags">
        <span>Tags</span>
        <input
          value={draft.tags.join(", ")}
          onChange={(event) =>
            setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })
          }
          onBlur={() => void persist(draft)}
          placeholder="comma, separated, tags"
        />
      </label>

      <div className="research-runbar">
        <input
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          placeholder="Optional direction, e.g. focus on injury recovery"
          aria-label="Research direction"
        />
        <div className="research-run-buttons">
          {ARTICLE_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              className={`button small mode-${mode}`}
              disabled={researching !== null || saving || !draft.title.trim()}
              title={ARTICLE_MODES.find((m) => m.mode === mode)?.hint}
              onClick={() => runResearch(mode)}
            >
              <Sparkles size={14} />
              {researching === mode
                ? "Researching…"
                : articleHasContent(draft, mode)
                ? `Rerun ${label}`
                : label}
            </button>
          ))}
        </div>
      </div>
      <p className="research-note">
        Running a mode replaces that tab&apos;s draft and sources, then auto-saves. {saving ? "Saving…" : ""}
      </p>
      {error && <ErrorBanner message={error} />}

      <div className="research-tabs" role="tablist">
        {ARTICLE_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={activeMode === mode}
            className={`research-tab${activeMode === mode ? " active" : ""}`}
            onClick={() => {
              setActiveMode(mode);
              setEditingText(false);
            }}
          >
            {label}
            {!articleHasContent(draft, mode) && <span className="research-tab-empty">empty</span>}
          </button>
        ))}
      </div>

      {usedPrompt && (
        <p className="research-used-direction">
          <strong>Direction used:</strong> {usedPrompt}
        </p>
      )}

      <div className="research-article-actions">
        <button type="button" className="button small ghost" onClick={() => setEditingText((value) => !value)}>
          <Pencil size={14} /> {editingText ? "Preview" : "Edit text"}
        </button>
        {body && (
          <button
            type="button"
            className="button small ghost"
            onClick={() => navigator.clipboard?.writeText(articleAsMarkdown(body, sources))}
          >
            <Download size={14} /> Copy markdown
          </button>
        )}
      </div>

      {editingText ? (
        <div className="research-edit">
          <textarea
            value={body}
            onChange={(event) => setDraft({ ...draft, [`${activeMode}_body`]: event.target.value } as Article)}
            rows={18}
            placeholder="Article body in markdown. Use [^1], [^2] markers tied to the sources below."
          />
          <label>
            <span>Sources (one per line)</span>
            <textarea
              value={sources.join("\n")}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  [`sources_${activeMode}`]: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                } as Article)
              }
              rows={4}
            />
          </label>
          <div className="research-edit-actions">
            <IconButton className="primary" type="button" disabled={saving} onClick={() => void persist(draft)} icon={<Check size={16} />}>
              {saving ? "Saving…" : "Save"}
            </IconButton>
            <button type="button" className="button ghost" onClick={() => setDraft(article)}>
              Revert
            </button>
          </div>
        </div>
      ) : body.trim() ? (
        <>
          <ArticleMarkdown>{withFootnotes(body, sources)}</ArticleMarkdown>
          <ArticleSources sources={sources} />
        </>
      ) : (
        <Empty>
          This tab is empty. Run <strong>{ARTICLE_MODES.find((m) => m.mode === activeMode)?.label}</strong> research above, or edit the text manually.
        </Empty>
      )}
    </article>
  );
}

// Pull every URL out of a citation string so it can be rendered as a link with
// the citation text preserved.
const SOURCE_URL_RE = /(https?:\/\/[^\s)]+)/g;

function splitSourceText(source: string): { text: string; urls: string[] } {
  const urls = source.match(SOURCE_URL_RE) ?? [];
  const text = source.replace(SOURCE_URL_RE, "").replace(/\s+/g, " ").replace(/[—–-]\s*$/, "").trim();
  return { text, urls };
}

function ArticleSources({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return (
    <section className="research-sources">
      <h3>Sources</h3>
      <ol>
        {sources.map((source, index) => {
          const { text, urls } = splitSourceText(source);
          return (
            <li key={index} id={`user-content-fn-${index + 1}`}>
              {text && <span>{text} </span>}
              {urls.map((url, urlIndex) => (
                <a key={urlIndex} href={url} target="_blank" rel="noopener noreferrer">
                  {url}
                </a>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Append GFM footnote definitions so [^N] markers in the body link to the
// matching source.
function withFootnotes(body: string, sources: string[]): string {
  if (!sources.length) return body;
  const defs = sources
    .map((source, index) => {
      const text = /^https?:\/\//.test(source) ? `<${source}>` : source;
      return `[^${index + 1}]: ${text}`;
    })
    .join("\n");
  return `${body}\n\n${defs}`;
}

function articleAsMarkdown(body: string, sources: string[]): string {
  if (!sources.length) return body;
  return `${body}\n\n## Sources\n${sources.map((source, index) => `${index + 1}. ${source}`).join("\n")}`;
}

function ArticleMarkdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => {
            const target = typeof href === "string" ? href : "";
            const isFootnoteRef = target.startsWith("#user-content-fn-");
            const isFootnoteBack = target.startsWith("#user-content-fnref-");
            if (isFootnoteRef) {
              return (
                <sup>
                  <a href={target}>{children}</a>
                </sup>
              );
            }
            if (isFootnoteBack) {
              return (
                <a href={target} className="footnote-back">
                  ↩
                </a>
              );
            }
            const external = /^https?:\/\//.test(target);
            return (
              <a href={target} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
                {children}
              </a>
            );
          },
          section: ({ children, ...props }) => {
            // GFM emits its own footnote list; we render our Sources panel instead.
            if ((props as Record<string, unknown>)["data-footnotes"] !== undefined) return null;
            return <section>{children}</section>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <main className="main">
          <Routes>
            <Route path="/" element={<TodayScreen />} />
            <Route path="/today" element={<Navigate to="/" replace />} />
            <Route path="/protocols" element={<ProtocolsGanttScreen />} />
            <Route path="/wins" element={<WinsScreen />} />
            <Route path="/projects" element={<ProjectsScreen />} />
            <Route path="/research" element={<ResearchScreen />} />
            <Route path="/people" element={<PeopleDirectoryScreen />} />
            <Route path="/vision" element={<Navigate to="/projects" replace />} />
            <Route path="/archive" element={<ArchiveScreen />} />
            <Route path="/archive/:id" element={<ProjectScreen readOnly />} />
            <Route path="/projects/new" element={<ProjectForm />} />
            <Route path="/projects/:id" element={<ProjectScreen />} />
            <Route path="/projects/:id/protocols/new" element={<ProtocolForm />} />
            <Route path="/protocols/:id" element={<ProtocolScreen />} />
            <Route path="/protocols/:id/entries/new" element={<ProtocolScreen openEntryOnMount />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink to="/">
        <CalendarDays size={20} />
        <span>Today</span>
      </NavLink>
      <NavLink to="/protocols">
        <ClipboardList size={20} />
        <span>Protocols</span>
      </NavLink>
      <NavLink to="/projects">
        <Folder size={20} />
        <span>Projects</span>
      </NavLink>
      <NavLink to="/research">
        <BookOpen size={20} />
        <span>Research</span>
      </NavLink>
    </nav>
  );
}

function Dashboard() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [completedToday, setCompletedToday] = useState<Todo[]>([]);
  const [activeProtocols, setActiveProtocols] = useState<Protocol[]>([]);
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const [completingTodoIds, setCompletingTodoIds] = useState<string[]>([]);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [todoData, protocolData] = await Promise.all([
        apiJson<{ todos: Todo[]; completed_today: Todo[] }>("/api/todos"),
        fetchActiveProtocolSummaries(),
      ]);
      setTodos(todoData.todos);
      setCompletedToday(todoData.completed_today);
      setActiveProtocols(protocolData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function reorderTodo(targetId: string) {
    if (!draggingTodoId || draggingTodoId === targetId) return;
    const currentIndex = todos.findIndex((todo) => todo.id === draggingTodoId);
    const targetIndex = todos.findIndex((todo) => todo.id === targetId);
    if (currentIndex === -1 || targetIndex === -1) return;

    const nextTodos = [...todos];
    const [moved] = nextTodos.splice(currentIndex, 1);
    nextTodos.splice(targetIndex, 0, moved);
    setTodos(nextTodos);
    setDraggingTodoId(null);

    try {
      await apiJson("/api/todos/reorder", {
        method: "PATCH",
        body: JSON.stringify({ ids: nextTodos.map((todo) => todo.id) }),
      });
    } catch (reorderError) {
      setError(reorderError instanceof Error ? reorderError.message : "Could not reorder to-dos");
      await load();
    }
  }

  async function completeTodo(todo: Todo) {
    setCompletingTodoIds((ids) => [...ids, todo.id]);
    window.setTimeout(() => {
      setTodos((current) => current.filter((item) => item.id !== todo.id));
    }, 150);

    try {
      await apiJson(`/api/todos/${todo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done: 1 }),
      });
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update to-do");
      setCompletingTodoIds((ids) => ids.filter((id) => id !== todo.id));
      await load();
    }
  }

  if (loading) return <Loading />;

  return (
    <section>
      <header className="topbar">
        <div>
          <p className="eyebrow">Cybernotes</p>
          <h1>Dashboard</h1>
        </div>
        <a className="icon-only" href="/auth/logout" aria-label="Sign out" title="Sign out">
          <LogOut size={20} />
        </a>
      </header>
      <ErrorBanner message={error} />
      <div className="action-row">
        <NavLink className="button primary" to="/projects/new">
          <Plus size={18} />
          <span>New Project</span>
        </NavLink>
        <NavLink className="button" to="/wins">
          <Trophy size={18} />
          <span>Wins</span>
        </NavLink>
      </div>

      <section className="dashboard-first">
        <div className="section-heading">
          <h2>Priority To-dos</h2>
          <span className="meta">{todos.length} open</span>
        </div>
        {!todos.length ? <Empty>No open to-dos across active projects.</Empty> : null}
        <div className="todo-priority-list">
          {todos.map((todo) => (
            <DashboardTodoItem
              completing={completingTodoIds.includes(todo.id)}
              key={todo.id}
              onDragEnd={() => setDraggingTodoId(null)}
              onDragStart={() => setDraggingTodoId(todo.id)}
              onDrop={() => reorderTodo(todo.id)}
              onToggle={() => completeTodo(todo)}
              todo={todo}
            />
          ))}
        </div>
      </section>

      <section className="section-block">
        <button className="completed-toggle" type="button" onClick={() => setCompletedOpen((open) => !open)}>
          <strong>Completed today</strong>
          <span className="meta">{completedToday.length}</span>
          <ChevronDown className={completedOpen ? "rotate" : ""} size={20} />
        </button>
        {completedOpen ? (
          <div className="todo-priority-list completed-list">
            {completedToday.length ? (
              completedToday.map((todo) => <DashboardTodoItem completing={false} key={todo.id} todo={todo} />)
            ) : (
              <Empty>Nothing completed today yet.</Empty>
            )}
          </div>
        ) : null}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>Active Protocols</h2>
          <span className="meta">{activeProtocols.length}</span>
        </div>
        <div className="compact-stack stack">
          {activeProtocols.map((protocol) => (
            <NavLink className="protocol-summary-row" key={protocol.id} to={`/protocols/${protocol.id}`}>
              <div>
                <strong>{protocol.title}</strong>
                <span>{protocol.project_title}</span>
              </div>
              <DeadlineBadge value={protocol.deadline} />
            </NavLink>
          ))}
          {!activeProtocols.length ? <Empty>No active protocols.</Empty> : null}
        </div>
      </section>
    </section>
  );
}

function TodoAssigneeBadges({ todo }: { todo: Todo }) {
  if (!todo.assignees?.length) return null;
  return (
    <span className="assignee-badges">
      {todo.assignees.map((assignee) => (
        <em className="assignee-badge" key={assignee.assignee_id} title={assignee.role ? roleLabel(assignee.role) : undefined}>
          {assignee.role ? `[${assignee.role}] ` : ""}
          {assignee.name}
        </em>
      ))}
    </span>
  );
}

function TodoRecurrenceBadge({ todo }: { todo: Todo }) {
  return <span className={`recurrence-badge ${todo.recurrence === "recurring" ? "is-recurring" : ""}`}>{todoRecurrenceLabel(todo)}</span>;
}

function DashboardTodoItem({
  completing,
  onDragEnd,
  onDragStart,
  onDrop,
  onToggle,
  todo,
}: {
  completing: boolean;
  onDragEnd?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
  onToggle?: () => void;
  todo: Todo;
}) {
  return (
    <article
      className={`dashboard-todo ${todo.done ? "done" : ""} ${completing ? "is-completing" : ""}`}
      draggable={Boolean(onDragStart)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (onDrop) event.preventDefault();
      }}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      {onDragStart ? <GripVertical className="drag-token" size={18} /> : <span />}
      <input
        aria-label={`Mark ${todo.body} complete`}
        checked={Boolean(todo.done)}
        disabled={!onToggle}
        onChange={onToggle}
        type="checkbox"
      />
      <div>
        <strong>{todo.body}</strong>
        <span>
          {[todo.project_title, todo.protocol_title].filter(Boolean).join(" / ")}
        </span>
        <div className="todo-meta-row">
          <DeadlineBadge value={todo.due_date} />
          <TodoRecurrenceBadge todo={todo} />
          <TodoAssigneeBadges todo={todo} />
        </div>
      </div>
    </article>
  );
}

function ProtocolsGanttScreen() {
  const navigate = useNavigate();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [columnWidth, setColumnWidth] = useState(ganttColumnWidth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [protocolData, projectData] = await Promise.all([
        apiJson<{ protocols: Protocol[] }>("/api/protocols/active"),
        apiJson<{ projects: Project[] }>("/api/projects?status=active"),
      ]);
      setProtocols(protocolData.protocols.filter((protocol) => protocol.deadline));
      setProjects(projectData.projects);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load protocols");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const updateColumnWidth = () => setColumnWidth(ganttColumnWidth());
    window.addEventListener("resize", updateColumnWidth);
    return () => window.removeEventListener("resize", updateColumnWidth);
  }, []);

  function handleCreated(protocol: Protocol) {
    navigate(`/protocols/${protocol.id}`);
  }

  if (loading) return <Loading />;

  const today = localDateValue();
  const maxDeadline = maxDateString(...protocols.map((protocol) => protocol.deadline));
  const endDate = maxDateString(addDays(today, 6), maxDeadline);
  const days = buildDateRange(today, endDate);
  const chartWidth = days.length * columnWidth;
  const dayGridTemplate = `repeat(${days.length}, ${columnWidth}px)`;
  const groups = Array.from(
    protocols.reduce((map, protocol) => {
      const key = protocol.project_id;
      const group = map.get(key) || {
        color: GANTT_PROJECT_COLORS[map.size % GANTT_PROJECT_COLORS.length],
        projectId: protocol.project_id,
        projectTitle: protocol.project_title || "Untitled project",
        protocols: [] as Protocol[],
      };
      group.protocols.push(protocol);
      map.set(key, group);
      return map;
    }, new Map<string, { color: string; projectId: string; projectTitle: string; protocols: Protocol[] }>()),
  ).map(([, group]) => group);

  return (
    <section>
      <header className="topbar">
        <div>
          <p className="eyebrow">Timeline</p>
          <h1>Protocols</h1>
        </div>
        <IconButton className="primary" type="button" onClick={() => setCreateOpen(true)} icon={<Plus size={18} />}>
          New Protocol
        </IconButton>
      </header>
      <ErrorBanner message={error} />
      {!protocols.length ? (
        <Empty>No active protocols with deadlines</Empty>
      ) : (
        <div className="gantt-scroll" aria-label="Active protocol timeline">
          <div className="gantt-chart" style={{ width: chartWidth }}>
            <div className="gantt-header" style={{ gridTemplateColumns: dayGridTemplate }}>
              {days.map((day) => (
                <div className={`gantt-day ${day === today ? "today" : ""}`} key={day}>
                  {formatGanttDay(day)}
                </div>
              ))}
            </div>
            <div className="gantt-body">
              <div className="gantt-today-line" style={{ left: 0 }} />
              {groups.map((group) => (
                <div className="gantt-group" key={group.projectId}>
                  <div
                    className="gantt-project-row"
                    style={{
                      borderLeftColor: group.color,
                      color: group.color,
                      width: chartWidth,
                    }}
                  >
                    {group.projectTitle}
                  </div>
                  {group.protocols.map((protocol) => (
                    <GanttProtocolRow
                      chartWidth={chartWidth}
                      color={group.color}
                      columnWidth={columnWidth}
                      dayGridTemplate={dayGridTemplate}
                      days={days}
                      key={protocol.id}
                      protocol={protocol}
                      today={today}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {createOpen ? (
        <NewProtocolSheet
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
          projects={projects}
        />
      ) : null}
    </section>
  );
}

function NewProtocolSheet({
  onClose,
  onCreated,
  projects,
}: {
  onClose: () => void;
  onCreated: (protocol: Protocol) => void;
  projects: Project[];
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [intervention, setIntervention] = useState("");
  const [metrics, setMetrics] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setError(null);
    try {
      const { protocol } = await apiJson<{ protocol: Protocol }>(`/api/projects/${projectId}/protocols`, {
        method: "POST",
        body: JSON.stringify({ title, goal, intervention, metrics, deadline }),
      });
      onClose();
      onCreated(protocol);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create protocol");
    }
  }

  return (
    <div className="sheet-backdrop">
      <form className="sheet form" onSubmit={submit}>
        <div className="section-heading">
          <h2>New Protocol</h2>
          <button type="button" className="icon-only" onClick={onClose} aria-label="Close" title="Close">
            <X size={20} />
          </button>
        </div>
        <ErrorBanner message={error} />
        {!projects.length ? <Empty>No active projects.</Empty> : null}
        <label>
          Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Goal
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={3} />
        </label>
        <label>
          Intervention
          <textarea value={intervention} onChange={(event) => setIntervention(event.target.value)} rows={4} />
        </label>
        <label>
          Metrics
          <textarea value={metrics} onChange={(event) => setMetrics(event.target.value)} rows={4} />
        </label>
        <label>
          Deadline
          <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
        </label>
        <IconButton className="primary" type="submit" disabled={!projects.length} icon={<Check size={18} />}>
          Create
        </IconButton>
      </form>
    </div>
  );
}

function GanttProtocolRow({
  chartWidth,
  color,
  columnWidth,
  dayGridTemplate,
  days,
  protocol,
  today,
}: {
  chartWidth: number;
  color: string;
  columnWidth: number;
  dayGridTemplate: string;
  days: string[];
  protocol: Protocol;
  today: string;
}) {
  const start = minDateString(dateOnly(protocol.created_at), dateOnly(protocol.project_started_at));
  const deadline = dateOnly(protocol.deadline);
  const rawStartIndex = daysBetween(today, start);
  const leftIndex = Math.max(0, rawStartIndex);
  const endIndex = Math.max(leftIndex, daysBetween(today, deadline));
  const left = leftIndex * columnWidth;
  const width = Math.max(columnWidth, (endIndex - leftIndex + 1) * columnWidth);
  const clipped = rawStartIndex < 0;
  const canShowLabel = width >= 96;

  return (
    <div className="gantt-row" style={{ width: chartWidth }}>
      <div className="gantt-row-columns" style={{ gridTemplateColumns: dayGridTemplate }}>
        {days.map((day) => (
          <span className={`gantt-column ${day === today ? "today" : ""}`} key={day} />
        ))}
      </div>
      <NavLink
        aria-label={protocol.title}
        className={`gantt-bar ${clipped ? "clipped-start" : ""}`}
        style={{ left, width, backgroundColor: hexToRgba(color, 0.8) }}
        to={`/protocols/${protocol.id}`}
      >
        {clipped ? <span className="gantt-start-arrow">←</span> : null}
        {canShowLabel ? <span className="gantt-bar-label">{protocol.title}</span> : null}
      </NavLink>
    </div>
  );
}

const EMPTY_CHECKIN_TEMPLATES: CheckinTemplatesBySession = { morning: [], evening: [] };
const EMPTY_CHECKIN_ENTRIES: CheckinEntriesBySession = { morning: null, evening: null };
const CHECKIN_SESSIONS: CheckinSession[] = ["morning", "evening"];

function answerMap(bundle: CheckinEntryBundle | null) {
  return Object.fromEntries((bundle?.answers || []).map((answer) => [answer.template_id, answer.answer || ""]));
}

function TodayScreen() {
  const today = localDateValue();
  const [selectedDate, setSelectedDate] = useState(today);
  const [templates, setTemplates] = useState<CheckinTemplatesBySession>(EMPTY_CHECKIN_TEMPLATES);
  const [entries, setEntries] = useState<CheckinEntriesBySession>(EMPTY_CHECKIN_ENTRIES);
  const [answers, setAnswers] = useState<Record<CheckinSession, Record<string, string>>>({ morning: {}, evening: {} });
  const [dates, setDates] = useState<Array<{ date: string; sessions: string }>>([]);
  const [activeProtocols, setActiveProtocols] = useState<Protocol[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [completedToday, setCompletedToday] = useState<Todo[]>([]);
  const [completingTodoIds, setCompletingTodoIds] = useState<string[]>([]);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [openSession, setOpenSession] = useState<CheckinSession | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const todoSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function load(date = selectedDate) {
    setLoading(true);
    setError(null);
    try {
      const [templateData, entryData, dateData, protocolData, todoData] = await Promise.all([
        apiJson<{ templates: CheckinTemplatesBySession }>("/api/checkin/templates"),
        apiJson<{ entries: CheckinEntriesBySession }>(`/api/checkin/entries/${date}`),
        apiJson<{ dates: Array<{ date: string; sessions: string }> }>("/api/checkin/entries"),
        fetchActiveProtocolSummaries(),
        apiJson<{ todos: Todo[]; completed_today: Todo[] }>("/api/todos"),
      ]);
      setTemplates(templateData.templates);
      setEntries(entryData.entries);
      setAnswers({
        morning: answerMap(entryData.entries.morning),
        evening: answerMap(entryData.entries.evening),
      });
      setDates(dateData.dates);
      setActiveProtocols(protocolData);
      setTodos(todoData.todos);
      setCompletedToday(todoData.completed_today);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load check-in");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(selectedDate);
  }, [selectedDate]);

  async function saveSession(session: CheckinSession) {
    setError(null);
    try {
      await apiJson("/api/checkin/entries", {
        method: "POST",
        body: JSON.stringify({
          date: selectedDate,
          session,
          answers: templates[session].map((template) => ({
            template_id: template.id,
            answer: answers[session][template.id] || "",
          })),
        }),
      });
      await load(selectedDate);
      setOpenSession(null);
      setAnswers((current) => ({ ...current, [session]: {} }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save check-in");
    }
  }

  function updateAnswer(session: CheckinSession, templateId: string, value: string) {
    setAnswers((current) => ({
      ...current,
      [session]: { ...current[session], [templateId]: value },
    }));
  }

  const hasUnsavedCheckin = CHECKIN_SESSIONS.some((session) => {
    const saved = answerMap(entries[session]);
    const current = answers[session];
    const keys = new Set([...Object.keys(saved), ...Object.keys(current)]);
    return [...keys].some((key) => (current[key] || "") !== (saved[key] || ""));
  });

  useEffect(() => {
    if (!hasUnsavedCheckin) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedCheckin]);

  function selectPastDate(date: string) {
    setSelectedDate(date);
    setDatesOpen(false);
    setOpenSession(null);
  }

  async function reorderTodos(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const oldIndex = todos.findIndex((todo) => todo.id === activeId);
    const newIndex = todos.findIndex((todo) => todo.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextTodos = arrayMove(todos, oldIndex, newIndex);
    setTodos(nextTodos);
    try {
      await apiJson("/api/todos/reorder", {
        method: "PATCH",
        body: JSON.stringify({ ids: nextTodos.map((todo) => todo.id) }),
      });
    } catch (reorderError) {
      setError(reorderError instanceof Error ? reorderError.message : "Could not reorder to-dos");
      await load(selectedDate);
    }
  }

  async function completeTodo(todo: Todo) {
    setCompletingTodoIds((ids) => [...ids, todo.id]);
    window.setTimeout(() => {
      setTodos((current) => current.filter((item) => item.id !== todo.id));
    }, 150);

    try {
      await apiJson(`/api/todos/${todo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done: 1 }),
      });
      await load(selectedDate);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update to-do");
      await load(selectedDate);
    } finally {
      setCompletingTodoIds((ids) => ids.filter((id) => id !== todo.id));
    }
  }

  if (loading) return <Loading />;

  const readOnly = selectedDate !== today;

  return (
    <section>
      <header className="topbar">
        <div>
          <p className="eyebrow">Today</p>
          <h1>{formatDate(selectedDate)}</h1>
        </div>
        <div className="small-actions">
          <button className="icon-only" type="button" onClick={() => setDatesOpen(true)} aria-label="Past entries" title="Past entries">
            <History size={20} />
          </button>
          <button className="icon-only" type="button" onClick={() => setSettingsOpen(true)} aria-label="Check-in settings" title="Check-in settings">
            <Settings size={20} />
          </button>
        </div>
      </header>
      <ErrorBanner message={error} />
      {readOnly ? (
        <div className="action-row">
          <button className="button" type="button" onClick={() => setSelectedDate(today)}>
            <CalendarDays size={18} />
            <span>Today</span>
          </button>
        </div>
      ) : null}

      <div className="stack">
        {CHECKIN_SESSIONS.map((session) => (
          <CheckinSessionPanel
            answers={answers[session]}
            bundle={entries[session]}
            isOpen={openSession === session}
            key={session}
            onAnswer={(templateId, value) => updateAnswer(session, templateId, value)}
            onSave={() => saveSession(session)}
            onToggle={() => setOpenSession(openSession === session ? null : session)}
            readOnly={readOnly}
            session={session}
            templates={templates[session]}
          />
        ))}
      </div>

      <div className="quick-capture-row">
        <IconButton className="outline-accent" type="button" onClick={() => setAddEntryOpen(true)} icon={<Plus size={18} />}>
          Add note
        </IconButton>
        <IconButton className="outline-accent" type="button" onClick={() => setAddTodoOpen(true)} icon={<Plus size={18} />}>
          Add to-do
        </IconButton>
      </div>

      <section className="section-block">
        <div className="section-heading">
          <h2>To-dos</h2>
          <span className="meta">{todos.length} open</span>
        </div>
        {!todos.length ? <Empty>No open to-dos across active projects.</Empty> : null}
        <DndContext sensors={todoSensors} collisionDetection={closestCenter} onDragEnd={reorderTodos}>
          <SortableContext items={todos.map((todo) => todo.id)} strategy={verticalListSortingStrategy}>
            <div className="todo-priority-list">
              {todos.map((todo) => (
                <SortableTodayTodoItem
                  completing={completingTodoIds.includes(todo.id)}
                  key={todo.id}
                  onEdit={() => setEditingTodo(todo)}
                  onToggle={() => completeTodo(todo)}
                  todo={todo}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      <section className="section-block">
        <button className="completed-toggle" type="button" onClick={() => setCompletedOpen((open) => !open)}>
          <strong>Completed today</strong>
          <span className="meta">{completedToday.length}</span>
          <ChevronDown className={completedOpen ? "rotate" : ""} size={20} />
        </button>
        {completedOpen ? (
          <div className="todo-priority-list completed-list">
            {completedToday.length ? (
              completedToday.map((todo) => (
                <TodayTodoItem completing={false} key={todo.id} onEdit={() => setEditingTodo(todo)} todo={todo} />
              ))
            ) : (
              <Empty>Nothing completed today yet.</Empty>
            )}
          </div>
        ) : null}
      </section>

      {addEntryOpen ? (
        <TodayEntrySheet
          onClose={() => setAddEntryOpen(false)}
          onSaved={() => load(selectedDate)}
          onToast={(message) => setToastMessage(message)}
          protocols={activeProtocols}
        />
      ) : null}
      {datesOpen ? (
        <div className="sheet-backdrop">
          <div className="sheet">
            <div className="section-heading">
              <h2>Past Entries</h2>
              <button className="icon-only" type="button" onClick={() => setDatesOpen(false)} aria-label="Close" title="Close">
                <X size={20} />
              </button>
            </div>
            {!dates.length ? <Empty>No saved check-ins.</Empty> : null}
            <div className="stack compact-stack">
              {dates.map((date) => (
                <button className="past-date-row" type="button" key={date.date} onClick={() => selectPastDate(date.date)}>
                  <strong>{formatDate(date.date)}</strong>
                  <span>{date.sessions.replace(",", " + ")}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <CheckinSettingsSheet
          onClose={() => setSettingsOpen(false)}
          onTemplatesChange={(nextTemplates) => setTemplates(nextTemplates)}
          reload={() => load(selectedDate)}
          templates={templates}
        />
      ) : null}

      {addTodoOpen ? (
        <TodoSheet
          onClose={() => setAddTodoOpen(false)}
          onSaved={() => load(selectedDate)}
          onToast={(message) => setToastMessage(message)}
          protocols={activeProtocols}
        />
      ) : null}
      {editingTodo ? (
        <TodoSheet
          onClose={() => setEditingTodo(null)}
          onSaved={() => load(selectedDate)}
          todo={editingTodo}
        />
      ) : null}
      <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
    </section>
  );
}

function TodayTodoItem({
  completing,
  onEdit,
  onToggle,
  todo,
}: {
  completing: boolean;
  onEdit?: () => void;
  onToggle?: () => void;
  todo: Todo;
}) {
  return (
    <article
      className={`dashboard-todo today-todo ${todo.done ? "done" : ""} ${completing ? "is-completing" : ""}`}
      onClick={onEdit}
    >
      <span />
      <input
        aria-label={`Mark ${todo.body} complete`}
        checked={Boolean(todo.done)}
        disabled={!onToggle}
        onChange={onToggle}
        onClick={(event) => event.stopPropagation()}
        type="checkbox"
      />
      <div>
        <strong>{todo.body}</strong>
        <span>{[todo.project_title, todo.protocol_title].filter(Boolean).join(" / ")}</span>
        <div className="todo-meta-row">
          <DeadlineBadge value={todo.due_date} />
          <TodoRecurrenceBadge todo={todo} />
          <TodoAssigneeBadges todo={todo} />
        </div>
      </div>
    </article>
  );
}

function SortableTodayTodoItem({
  completing,
  onEdit,
  onToggle,
  todo,
}: {
  completing: boolean;
  onEdit?: () => void;
  onToggle: () => void;
  todo: Todo;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      className={`dashboard-todo today-todo ${completing ? "is-completing" : ""} ${isDragging ? "is-dragging" : ""}`}
      onClick={onEdit}
      ref={setNodeRef}
      style={style}
    >
      <button className="drag-handle" type="button" aria-label={`Reorder ${todo.body}`} onClick={(event) => event.stopPropagation()} {...attributes} {...listeners}>
        <GripVertical size={18} />
      </button>
      <input
        aria-label={`Mark ${todo.body} complete`}
        checked={Boolean(todo.done)}
        onChange={onToggle}
        onClick={(event) => event.stopPropagation()}
        type="checkbox"
      />
      <div>
        <strong>{todo.body}</strong>
        <span>{[todo.project_title, todo.protocol_title].filter(Boolean).join(" / ")}</span>
        <div className="todo-meta-row">
          <DeadlineBadge value={todo.due_date} />
          <TodoRecurrenceBadge todo={todo} />
          <TodoAssigneeBadges todo={todo} />
        </div>
      </div>
    </article>
  );
}

type TodoAssigneeDraft = {
  key: string;
  assignee_id?: string;
  person_id: string;
  name: string;
  query: string;
  role: string;
  pickerOpen: boolean;
};

function assigneeDraftFromTodo(assignee: TodoAssignee): TodoAssigneeDraft {
  return {
    key: assignee.assignee_id,
    assignee_id: assignee.assignee_id,
    person_id: assignee.person_id,
    name: assignee.name,
    query: assignee.name,
    role: assignee.role || "",
    pickerOpen: false,
  };
}

function emptyAssigneeDraft(): TodoAssigneeDraft {
  return {
    key: crypto.randomUUID(),
    person_id: "",
    name: "",
    query: "",
    role: "",
    pickerOpen: true,
  };
}

function normalizedAssignees(rows: TodoAssigneeDraft[]) {
  const seen = new Set<string>();
  return rows
    .filter((row) => row.person_id)
    .filter((row) => {
      if (seen.has(row.person_id)) return false;
      seen.add(row.person_id);
      return true;
    })
    .map((row) => ({
      assignee_id: row.assignee_id,
      person_id: row.person_id,
      role: row.role || null,
    }));
}

function todayWeekday() {
  return new Date(`${localDateValue()}T00:00:00`).getDay();
}

function todayMonthDay() {
  return Number(localDateValue().slice(8, 10));
}

function todoSheetSnapshot(
  protocolId: string,
  body: string,
  dueDate: string,
  recurrence: Todo["recurrence"],
  recurrenceFrequency: NonNullable<Todo["recurrence_frequency"]>,
  recurrenceDay: number | null,
  assignees: TodoAssigneeDraft[],
) {
  return JSON.stringify({
    protocolId,
    body: body.trim(),
    dueDate,
    recurrence,
    recurrenceFrequency,
    recurrenceDay,
    assignees: normalizedAssignees(assignees).map((assignee) => ({
      person_id: assignee.person_id,
      role: assignee.role,
    })),
  });
}

function TodoSheet({
  fixedProtocolId,
  onClose,
  onSaved,
  onToast,
  protocols = [],
  todo,
}: {
  fixedProtocolId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToast?: (message: string) => void;
  protocols?: Protocol[];
  todo?: Todo | null;
}) {
  const initial = useRef({
    protocolId: fixedProtocolId || todo?.protocol_id || protocols[0]?.id || "",
    body: todo?.body || "",
    dueDate: todo?.due_date || "",
    recurrence: todo?.recurrence || "one_off",
    recurrenceFrequency: todo?.recurrence_frequency || "daily",
    recurrenceDay: todo?.recurrence_day ?? null,
    assignees: (todo?.assignees || []).map(assigneeDraftFromTodo),
  });
  const [protocolId, setProtocolId] = useState(initial.current.protocolId);
  const [body, setBody] = useState(initial.current.body);
  const [dueDate, setDueDate] = useState(initial.current.dueDate);
  const [recurrence, setRecurrence] = useState<Todo["recurrence"]>(initial.current.recurrence);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<NonNullable<Todo["recurrence_frequency"]>>(initial.current.recurrenceFrequency);
  const [recurrenceDay, setRecurrenceDay] = useState<number | null>(initial.current.recurrenceDay);
  const [assignees, setAssignees] = useState<TodoAssigneeDraft[]>(initial.current.assignees);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLInputElement | null>(null);
  const initialSnapshot = useRef(
    todoSheetSnapshot(
      initial.current.protocolId,
      initial.current.body,
      initial.current.dueDate,
      initial.current.recurrence,
      initial.current.recurrenceFrequency,
      initial.current.recurrenceDay,
      initial.current.assignees,
    ),
  );
  const canChooseProtocol = !fixedProtocolId && !todo;
  const isEditing = Boolean(todo);

  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    setPeopleLoading(true);
    apiJson<{ people: DirectoryPerson[] }>("/api/people")
      .then(({ people: nextPeople }) => {
        if (active) setPeople(nextPeople);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load people");
      })
      .finally(() => {
        if (active) setPeopleLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function isDirty() {
    return todoSheetSnapshot(protocolId, body, dueDate, recurrence, recurrenceFrequency, recurrenceDay, assignees) !== initialSnapshot.current;
  }

  function requestClose() {
    if (isDirty() && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }

  function updateAssignee(key: string, updater: (row: TodoAssigneeDraft) => TodoAssigneeDraft) {
    setAssignees((current) => current.map((row) => (row.key === key ? updater(row) : row)));
  }

  function changeRecurrence(nextRecurrence: Todo["recurrence"]) {
    setRecurrence(nextRecurrence);
    if (nextRecurrence === "recurring" && recurrenceFrequency !== "daily" && recurrenceDay === null) {
      setRecurrenceDay(recurrenceFrequency === "weekly" ? todayWeekday() : todayMonthDay());
    }
  }

  function changeRecurrenceFrequency(nextFrequency: NonNullable<Todo["recurrence_frequency"]>) {
    setRecurrenceFrequency(nextFrequency);
    if (nextFrequency === "daily") {
      setRecurrenceDay(null);
    } else if (nextFrequency === "weekly") {
      setRecurrenceDay((current) => (current !== null && current >= 0 && current <= 6 ? current : todayWeekday()));
    } else {
      setRecurrenceDay((current) => (current !== null && current >= 1 && current <= 31 ? current : todayMonthDay()));
    }
  }

  function selectPerson(key: string, person: DirectoryPerson) {
    updateAssignee(key, (row) => ({
      ...row,
      assignee_id: row.person_id === person.id ? row.assignee_id : undefined,
      person_id: person.id,
      name: person.name,
      query: person.name,
      pickerOpen: false,
    }));
  }

  async function createAndSelectPerson(key: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    setError(null);
    try {
      const { person } = await apiJson<{ person: DirectoryPerson }>("/api/people", {
        method: "POST",
        body: JSON.stringify({ name: cleanName }),
      });
      setPeople((current) => [...current, person].sort((left, right) => left.name.localeCompare(right.name)));
      selectPerson(key, person);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not add person");
    }
  }

  async function syncAssignees(todoId: string, nextAssignees: ReturnType<typeof normalizedAssignees>) {
    const previousAssignees = todo?.assignees || [];
    for (const previous of previousAssignees) {
      const kept = nextAssignees.find(
        (assignee) => assignee.assignee_id === previous.assignee_id && assignee.person_id === previous.person_id,
      );
      if (!kept) {
        await apiJson(`/api/todo-assignees/${previous.assignee_id}`, { method: "DELETE" });
      }
    }
    for (const next of nextAssignees) {
      const previous = next.assignee_id
        ? previousAssignees.find(
            (assignee) => assignee.assignee_id === next.assignee_id && assignee.person_id === next.person_id,
          )
        : null;
      if (!previous) {
        await apiJson(`/api/todos/${todoId}/assignees`, {
          method: "POST",
          body: JSON.stringify({ person_id: next.person_id, role: next.role }),
        });
      } else if ((previous.role || null) !== next.role) {
        await apiJson(`/api/todo-assignees/${previous.assignee_id}`, {
          method: "PATCH",
          body: JSON.stringify({ role: next.role }),
        });
      }
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const selectedProtocolId = fixedProtocolId || protocolId;
    if (!selectedProtocolId) {
      setError("Choose a protocol");
      return;
    }
    if (assignees.some((assignee) => assignee.query.trim() && !assignee.person_id)) {
      setError("Choose a person from the directory or add the typed name first");
      return;
    }

    const nextAssignees = normalizedAssignees(assignees);
    const recurrencePayload =
      recurrence === "recurring"
        ? {
            recurrence,
            recurrence_frequency: recurrenceFrequency,
            recurrence_day: recurrenceFrequency === "daily" ? null : recurrenceDay,
          }
        : { recurrence, recurrence_frequency: null, recurrence_day: null };
    setError(null);
    try {
      if (todo) {
        await apiJson(`/api/todos/${todo.id}`, {
          method: "PATCH",
          body: JSON.stringify({ body, due_date: dueDate, ...recurrencePayload }),
        });
        await syncAssignees(todo.id, nextAssignees);
      } else {
        await apiJson(`/api/protocols/${selectedProtocolId}/todos`, {
          method: "POST",
          body: JSON.stringify({
            body,
            due_date: dueDate,
            ...recurrencePayload,
            assignees: nextAssignees.map((assignee) => ({ person_id: assignee.person_id, role: assignee.role })),
          }),
        });
      }
      await onSaved();
      if (!todo && onToast) {
        const selectedProtocol = protocols.find((protocol) => protocol.id === selectedProtocolId);
        onToast(`To-do added to ${selectedProtocol?.title || "protocol"}`);
      }
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save to-do");
    }
  }

  return (
    <BottomSheet className="form todo-sheet" onClose={requestClose} onSubmit={submit}>
        <div className="section-heading">
          <h2>{isEditing ? "Edit to-do" : "Add to-do"}</h2>
          <div className="small-actions">
            <button className="icon-only primary-icon" type="submit" aria-label="Save to-do" title="Save to-do">
              <Check size={20} />
            </button>
            <button type="button" className="icon-only" onClick={requestClose} aria-label="Close" title="Close">
              <X size={20} />
            </button>
          </div>
        </div>
        <ErrorBanner message={error} />
        {canChooseProtocol ? (
          <>
            {!protocols.length ? <Empty>No active protocols.</Empty> : null}
            <label>
              Protocol
              <select value={protocolId} onChange={(event) => setProtocolId(event.target.value)} required>
                {protocols.map((protocol) => (
                  <option value={protocol.id} key={protocol.id}>
                    {protocol.project_title ? `${protocol.project_title} / ` : ""}
                    {protocol.title}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label>
          Body
          <input ref={bodyRef} value={body} onChange={(event) => setBody(event.target.value)} required />
        </label>
        <label>
          Due date
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <div className="field-group">
          <span className="field-label">Type</span>
          <div className="segmented-control" role="group" aria-label="To-do type">
            {TODO_RECURRENCE_OPTIONS.map((option) => (
              <button
                aria-pressed={recurrence === option.value}
                className={recurrence === option.value ? "active" : ""}
                key={option.value}
                onClick={() => changeRecurrence(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {recurrence === "recurring" ? (
          <div className="field-group">
            <span className="field-label">Repeats</span>
            <div className="segmented-control three-up" role="group" aria-label="Recurring frequency">
              {TODO_RECURRENCE_FREQUENCIES.map((option) => (
                <button
                  aria-pressed={recurrenceFrequency === option.value}
                  className={recurrenceFrequency === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => changeRecurrenceFrequency(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {recurrence === "recurring" && recurrenceFrequency === "weekly" ? (
          <label>
            Day
            <select value={recurrenceDay ?? todayWeekday()} onChange={(event) => setRecurrenceDay(Number(event.target.value))}>
              {WEEKDAY_OPTIONS.map((day) => (
                <option value={day.value} key={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {recurrence === "recurring" && recurrenceFrequency === "monthly" ? (
          <label>
            Day
            <select value={recurrenceDay ?? todayMonthDay()} onChange={(event) => setRecurrenceDay(Number(event.target.value))}>
              {MONTH_DAY_OPTIONS.map((day) => (
                <option value={day} key={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="field-group">
          <span className="field-label">Assignees</span>
          <div className="assignee-editor-list">
            {assignees.map((assignee) => {
              const query = assignee.query.trim().toLowerCase();
              const matches = people
                .filter((person) => !query || person.name.toLowerCase().includes(query))
                .slice(0, 8);
              const hasExactMatch = people.some((person) => person.name.toLowerCase() === query);
              return (
                <div className="assignee-editor-row" key={assignee.key}>
                  <div className="person-picker">
                    <input
                      autoComplete="off"
                      placeholder="Search people"
                      value={assignee.query}
                      onBlur={() => window.setTimeout(() => updateAssignee(assignee.key, (row) => ({ ...row, pickerOpen: false })), 120)}
                      onChange={(event) => {
                        const nextQuery = event.target.value;
                        updateAssignee(assignee.key, (row) => ({
                          ...row,
                          assignee_id: undefined,
                          person_id: "",
                          name: "",
                          query: nextQuery,
                          pickerOpen: true,
                        }));
                      }}
                      onFocus={() => updateAssignee(assignee.key, (row) => ({ ...row, pickerOpen: true }))}
                    />
                    {assignee.pickerOpen ? (
                      <div className="person-picker-menu">
                        {peopleLoading ? <span className="person-picker-status">Loading people...</span> : null}
                        {!peopleLoading && matches.length
                          ? matches.map((person) => (
                              <button type="button" key={person.id} onClick={() => selectPerson(assignee.key, person)}>
                                <strong>{person.name}</strong>
                                {person.note ? <span>{person.note}</span> : null}
                              </button>
                            ))
                          : null}
                        {!peopleLoading && query && !hasExactMatch ? (
                          <button type="button" onClick={() => createAndSelectPerson(assignee.key, assignee.query)}>
                            Add {assignee.query.trim()} to directory
                          </button>
                        ) : null}
                        {!peopleLoading && !matches.length && !query ? (
                          <span className="person-picker-status">No people yet</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="rasci-control compact-rasci" role="group" aria-label={`RASCI role for ${assignee.name || "assignee"}`}>
                    {RASCI_ROLES.map((role) => (
                      <button
                        aria-pressed={assignee.role === role.value}
                        className={`role-chip ${assignee.role === role.value ? "active" : ""}`}
                        key={role.value}
                        onClick={() =>
                          updateAssignee(assignee.key, (row) => ({
                            ...row,
                            role: row.role === role.value ? "" : role.value,
                          }))
                        }
                        title={role.label}
                        type="button"
                      >
                        {role.value}
                      </button>
                    ))}
                  </div>
                  <button
                    className="icon-only danger assignee-remove"
                    type="button"
                    onClick={() => setAssignees((current) => current.filter((row) => row.key !== assignee.key))}
                    aria-label={`Remove ${assignee.name || "assignee"}`}
                    title="Remove assignee"
                  >
                    <X size={18} />
                  </button>
                </div>
              );
            })}
          </div>
          <button className="button add-assignee-button" type="button" onClick={() => setAssignees((current) => [...current, emptyAssigneeDraft()])}>
            <UserPlus size={18} />
            <span>Add person</span>
          </button>
        </div>
      </BottomSheet>
  );
}

function entryTagChips(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
}

function TodayEntrySheet({
  onClose,
  onSaved,
  onToast,
  protocols,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToast?: (message: string) => void;
  protocols: Protocol[];
}) {
  const [selectedProtocolId, setSelectedProtocolId] = useState("");
  const [protocolSearch, setProtocolSearch] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [telegramPost, setTelegramPost] = useState("");
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramSent, setTelegramSent] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const selectedProtocol = protocols.find((protocol) => protocol.id === selectedProtocolId) || null;
  const tagsPreview = entryTagChips(tags);
  const normalizedSearch = protocolSearch.trim().toLowerCase();
  const protocolGroups = useMemo(() => {
    const groups = new Map<string, Protocol[]>();
    for (const protocol of protocols) {
      const projectTitle = protocol.project_title || "No project";
      const haystack = `${projectTitle} ${protocol.title}`.toLowerCase();
      if (normalizedSearch && !haystack.includes(normalizedSearch)) continue;
      groups.set(projectTitle, [...(groups.get(projectTitle) || []), protocol]);
    }
    return Array.from(groups.entries());
  }, [normalizedSearch, protocols]);

  useEffect(() => {
    if (!selectedProtocolId) return;
    window.setTimeout(() => bodyRef.current?.focus(), 0);
  }, [selectedProtocolId]);

  function isDirty() {
    return Boolean(selectedProtocolId || body.trim() || tags.trim());
  }

  function requestClose() {
    if (isDirty() && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }

  async function transcribeImage(file: File) {
    setTranscribing(true);
    setTranscriptionError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const { text } = await apiJson<{ text: string }>("/api/transcribe", { method: "POST", body: form });
      if (text) appendTranscript(text);
    } catch {
      setTranscriptionError("Transcription failed — try again");
    } finally {
      setTranscribing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function appendTranscript(text: string) {
    setBody((current) => {
      const nextText = text.trim();
      return current.trim() ? `${current.replace(/\s+$/, "")}\n${nextText}` : nextText;
    });
  }

  function releaseRecorder() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function transcribeAudio(blob: Blob) {
    setTranscribing(true);
    setTranscriptionError(null);
    try {
      const wav = await recordingToWav(blob);
      const form = new FormData();
      form.append("audio", wav, "memo.wav");
      const { text } = await apiJson<{ text: string }>("/api/transcribe-audio", { method: "POST", body: form });
      if (text && text.trim()) appendTranscript(text);
      else setTranscriptionError("No speech detected — try again");
    } catch {
      setTranscriptionError("Transcription failed — try again");
    } finally {
      setTranscribing(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  async function startRecording() {
    setTranscriptionError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setTranscriptionError("Recording isn't supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        releaseRecorder();
        setRecording(false);
        setElapsed(0);
        if (blob.size > 0) void transcribeAudio(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed((seconds) => {
          const next = seconds + 1;
          if (next >= MAX_RECORDING_SECONDS) stopRecording();
          return next;
        });
      }, 1000);
    } catch {
      setTranscriptionError("Microphone access denied");
      releaseRecorder();
    }
  }

  useEffect(
    () => () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      releaseRecorder();
    },
    [],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProtocol) {
      setError("Choose a protocol");
      return;
    }
    if (!body.trim()) {
      setError("Entry body is required");
      return;
    }

    setError(null);
    try {
      await apiJson<{ entry: Entry }>(`/api/protocols/${selectedProtocol.id}/entries`, {
        method: "POST",
        body: JSON.stringify({
          body,
          tags: tagsPreview,
          created_at: new Date().toISOString(),
        }),
      });
      await onSaved();
      onToast?.(`Entry added to ${selectedProtocol.title}`);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save entry");
    }
  }

  async function reformatForTelegram() {
    if (!body.trim()) {
      setTelegramError("Write a note first");
      return;
    }
    setTelegramBusy(true);
    setTelegramError(null);
    setTelegramSent(false);
    try {
      const { post } = await apiJson<{ post: string }>("/api/telegram/reformat", {
        method: "POST",
        body: JSON.stringify({ text: body }),
      });
      setTelegramPost(post);
    } catch (reformatError) {
      setTelegramError(reformatError instanceof Error ? reformatError.message : "Could not reformat note");
    } finally {
      setTelegramBusy(false);
    }
  }

  async function postToTelegram() {
    if (!telegramPost.trim()) {
      setTelegramError("Reformat or write a post first");
      return;
    }
    setTelegramBusy(true);
    setTelegramError(null);
    try {
      await apiJson<{ ok: boolean }>("/api/telegram/post", {
        method: "POST",
        body: JSON.stringify({ text: telegramPost }),
      });
      setTelegramSent(true);
      onToast?.("Posted to Telegram");
    } catch (postError) {
      setTelegramError(postError instanceof Error ? postError.message : "Could not post to Telegram");
    } finally {
      setTelegramBusy(false);
    }
  }

  return (
    <BottomSheet className="form todo-sheet entry-sheet" onClose={requestClose} onSubmit={submit}>
      <div className="section-heading">
        <h2>Add note</h2>
      </div>
      <ErrorBanner message={error} />
      <div className="field-group">
        <span className="field-label">Protocol</span>
        {selectedProtocol ? (
          <div className="selected-protocol-chip">
            <span>{selectedProtocol.project_title ? `${selectedProtocol.project_title} / ` : ""}{selectedProtocol.title}</span>
            <button type="button" onClick={() => setSelectedProtocolId("")} aria-label="Clear protocol" title="Clear protocol">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="protocol-picker">
            <input
              autoComplete="off"
              placeholder="Search protocols"
              value={protocolSearch}
              onChange={(event) => setProtocolSearch(event.target.value)}
            />
            <div className="protocol-picker-menu">
              {!protocols.length ? <span className="person-picker-status">No active protocols</span> : null}
              {protocolGroups.map(([projectTitle, projectProtocols]) => (
                <div className="protocol-picker-group" key={projectTitle}>
                  <span>{projectTitle}</span>
                  {projectProtocols.map((protocol) => (
                    <button
                      type="button"
                      key={protocol.id}
                      onClick={() => {
                        setSelectedProtocolId(protocol.id);
                        setProtocolSearch("");
                      }}
                    >
                      {protocol.title}
                    </button>
                  ))}
                </div>
              ))}
              {protocols.length && !protocolGroups.length ? <span className="person-picker-status">No matching protocols</span> : null}
            </div>
          </div>
        )}
      </div>
      <label>
        Body
        <div className="entry-body-field">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What are you observing?"
            rows={9}
            required
          />
          {transcribing ? <span className="transcription-state">Transcribing...</span> : null}
        </div>
      </label>
      <div className="transcription-actions">
        <button
          className="button"
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={transcribing || recording}
        >
          <Camera size={18} />
          <span>{transcribing ? "Transcribing..." : "Transcribe handwriting"}</span>
        </button>
        <button
          className={`button${recording ? " danger" : ""}`}
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing}
        >
          {recording ? <Square size={18} /> : <Mic size={18} />}
          <span>
            {recording
              ? `Stop · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
              : transcribing
                ? "Transcribing..."
                : "Record voice"}
          </span>
        </button>
        <input
          ref={fileRef}
          className="hidden-file-input"
          type="file"
          accept="image/png,image/jpeg"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void transcribeImage(file);
          }}
        />
        {transcriptionError ? <span className="inline-error">{transcriptionError}</span> : null}
      </div>
      <label>
        Tags
        <input className="mono-input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="research, signal, follow-up" />
      </label>
      {tagsPreview.length ? (
        <div className="tag-row">
          {tagsPreview.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="telegram-share">
        <button
          type="button"
          className="telegram-toggle"
          onClick={() => setTelegramOpen((open) => !open)}
          aria-expanded={telegramOpen}
        >
          <Send size={16} />
          <span>Share to Telegram</span>
          <ChevronDown size={16} className={telegramOpen ? "chevron open" : "chevron"} />
        </button>
        {telegramOpen ? (
          <div className="telegram-panel">
            <button
              className="button"
              type="button"
              onClick={() => void reformatForTelegram()}
              disabled={telegramBusy || !body.trim()}
            >
              <Sparkles size={18} />
              <span>{telegramBusy && !telegramSent ? "Reformatting..." : "Reformat as post"}</span>
            </button>
            <textarea
              value={telegramPost}
              onChange={(event) => {
                setTelegramPost(event.target.value);
                setTelegramSent(false);
              }}
              placeholder="Your note, rewritten as a post — edit before sending"
              rows={4}
            />
            {telegramError ? <span className="inline-error">{telegramError}</span> : null}
            <button
              className="button primary"
              type="button"
              onClick={() => void postToTelegram()}
              disabled={telegramBusy || !telegramPost.trim()}
            >
              <Send size={18} />
              <span>{telegramSent ? "Posted ✓" : telegramBusy ? "Posting..." : "Post to Telegram"}</span>
            </button>
          </div>
        ) : null}
      </div>
      <div className="sheet-footer">
        <button type="button" className="button" onClick={requestClose}>
          <span>Close</span>
        </button>
        <button className="button primary" type="submit">
          <Check size={18} />
          <span>Save</span>
        </button>
      </div>
    </BottomSheet>
  );
}

function CheckinSessionPanel({
  answers,
  bundle,
  isOpen,
  onAnswer,
  onSave,
  onToggle,
  readOnly,
  session,
  templates,
}: {
  answers: Record<string, string>;
  bundle: CheckinEntryBundle | null;
  isOpen: boolean;
  onAnswer: (templateId: string, value: string) => void;
  onSave: () => Promise<void>;
  onToggle: () => void;
  readOnly: boolean;
  session: CheckinSession;
  templates: CheckinTemplate[];
}) {
  const historicalAnswers = bundle?.answers || [];
  return (
    <article className="card checkin-card">
      <button className="unstyled checkin-summary" type="button" onClick={onToggle}>
        <div>
          <h2>{session === "morning" ? "Morning" : "Evening"}</h2>
          <p className="meta">{bundle ? `Saved ${formatDateTime(bundle.entry.updated_at)}` : "Not saved yet"}</p>
        </div>
        <ChevronDown className={isOpen ? "rotate" : ""} size={20} />
      </button>
      {isOpen ? (
        <div className="checkin-form">
          {readOnly ? (
            historicalAnswers.length ? (
              historicalAnswers.map((answer) => (
                <label key={answer.id}>
                  {answer.question_snapshot}
                  <textarea value={answer.answer || ""} readOnly rows={4} />
                </label>
              ))
            ) : (
              <Empty>No saved {session} check-in.</Empty>
            )
          ) : (
            <>
              {templates.map((template) => (
                <label key={template.id}>
                  <span>
                    {template.question}
                    {template.question.toLowerCase() === "letters to god" ? <em className="optional">optional</em> : null}
                  </span>
                  <textarea
                    value={answers[template.id] || ""}
                    onChange={(event) => onAnswer(template.id, event.target.value)}
                    rows={4}
                  />
                </label>
              ))}
              <div className="action-row align-end">
                <IconButton type="button" className="primary" onClick={onSave} icon={<Check size={18} />}>
                  Save
                </IconButton>
              </div>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function CheckinSettingsSheet({
  onClose,
  onTemplatesChange,
  reload,
  templates,
}: {
  onClose: () => void;
  onTemplatesChange: (templates: CheckinTemplatesBySession) => void;
  reload: () => Promise<void>;
  templates: CheckinTemplatesBySession;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newQuestion, setNewQuestion] = useState<Record<CheckinSession, string>>({ morning: "", evening: "" });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    void apiJson<{ email: string; name: string }>("/api/profile")
      .then((profile) => {
        setProfileEmail(profile.email);
        setProfileName(profile.name);
      })
      .catch(() => {});
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      await apiJson("/api/profile", { method: "PUT", body: JSON.stringify({ name: profileName.trim() }) });
      setProfileSaved(true);
    } catch {
      // Leave the field as-is so the user can retry.
    } finally {
      setSavingProfile(false);
    }
  }

  async function updateTemplate(template: CheckinTemplate, payload: Partial<Pick<CheckinTemplate, "question" | "position">>) {
    await apiJson(`/api/checkin/templates/${template.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async function addQuestion(session: CheckinSession) {
    const question = newQuestion[session].trim();
    if (!question) return;
    await apiJson("/api/checkin/templates", {
      method: "POST",
      body: JSON.stringify({ session, question, position: templates[session].length + 1 }),
    });
    setNewQuestion((current) => ({ ...current, [session]: "" }));
    await reload();
  }

  async function archiveQuestion(template: CheckinTemplate) {
    if (!window.confirm("This question will be hidden from future check-ins. Past answers are preserved.")) return;
    await apiJson(`/api/checkin/templates/${template.id}`, { method: "DELETE" });
    await reload();
  }

  async function saveEdit(template: CheckinTemplate) {
    await updateTemplate(template, { question: draft });
    setEditingId(null);
    setDraft("");
    await reload();
  }

  async function reorder(session: CheckinSession, targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const current = templates[session];
    const from = current.findIndex((template) => template.id === draggingId);
    const to = current.findIndex((template) => template.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const nextTemplates = { ...templates, [session]: next.map((template, index) => ({ ...template, position: index + 1 })) };
    onTemplatesChange(nextTemplates);
    await Promise.all(nextTemplates[session].map((template) => updateTemplate(template, { position: template.position })));
    setDraggingId(null);
    await reload();
  }

  return (
    <div className="sheet-backdrop">
      <div className="sheet settings-sheet">
        <div className="section-heading">
          <h2>Settings</h2>
          <button className="icon-only" type="button" onClick={onClose} aria-label="Close" title="Close">
            <X size={20} />
          </button>
        </div>
        <section className="section-block account-settings">
          <h3>Account</h3>
          <label>
            Profile name
            <input
              value={profileName}
              onChange={(event) => {
                setProfileName(event.target.value);
                setProfileSaved(false);
              }}
              placeholder={profileEmail || "Your name"}
            />
          </label>
          <p className="field-hint">Shown on your Telegram posts. Falls back to your email if left empty.</p>
          <div className="account-actions">
            <button className="button primary" type="button" onClick={() => void saveProfile()} disabled={savingProfile}>
              <Check size={18} />
              <span>{profileSaved ? "Saved" : savingProfile ? "Saving..." : "Save name"}</span>
            </button>
            <a className="button danger" href="/auth/logout">
              <LogOut size={18} />
              <span>Sign out</span>
            </a>
          </div>
        </section>
        <h3 className="settings-subhead">Check-ins</h3>
        {CHECKIN_SESSIONS.map((session) => (
          <section className="section-block" key={session}>
            <h3>{session === "morning" ? "Morning" : "Evening"}</h3>
            <div className="stack compact-stack checkin-settings-list">
              {templates[session].map((template) => (
                <article
                  className="settings-row"
                  draggable
                  key={template.id}
                  onDragStart={() => setDraggingId(template.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorder(session, template.id)}
                >
                  <GripVertical size={18} />
                  {editingId === template.id ? (
                    <input value={draft} onChange={(event) => setDraft(event.target.value)} />
                  ) : (
                    <button
                      className="unstyled"
                      type="button"
                      onClick={() => {
                        setEditingId(template.id);
                        setDraft(template.question);
                      }}
                    >
                      {template.question}
                    </button>
                  )}
                  <div className="small-actions">
                    {editingId === template.id ? (
                      <button className="icon-only" type="button" onClick={() => saveEdit(template)} aria-label="Save question" title="Save question">
                        <Check size={18} />
                      </button>
                    ) : null}
                    <button className="icon-only danger" type="button" onClick={() => archiveQuestion(template)} aria-label="Archive question" title="Archive question">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="inline-add-row">
              <input value={newQuestion[session]} onChange={(event) => setNewQuestion((current) => ({ ...current, [session]: event.target.value }))} />
              <button className="button" type="button" onClick={() => addQuestion(session)}>
                <Plus size={18} />
                <span>Add question</span>
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function WinsScreen() {
  const [wins, setWins] = useState<Win[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [editingProjectId, setEditingProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ wins: nextWins }, { projects: nextProjects }] = await Promise.all([
        apiJson<{ wins: Win[] }>("/api/wins"),
        apiJson<{ projects: Project[] }>("/api/projects?status=active"),
      ]);
      setWins(nextWins);
      setProjects(nextProjects);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load wins");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addWin(event: React.FormEvent) {
    event.preventDefault();
    await apiJson("/api/wins", {
      method: "POST",
      body: JSON.stringify({ body: newBody, project_id: newProjectId || null }),
    });
    setNewBody("");
    setNewProjectId("");
    setAddOpen(false);
    await load();
  }

  function startEdit(win: Win) {
    setEditingId(win.id);
    setEditingBody(win.body);
    setEditingProjectId(win.project_id || "");
  }

  async function saveEdit(win: Win) {
    await apiJson(`/api/wins/${win.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: editingBody, project_id: editingProjectId || null }),
    });
    setEditingId(null);
    await load();
  }

  async function deleteWin(win: Win) {
    if (!window.confirm("Delete this win?")) return;
    await apiJson(`/api/wins/${win.id}`, { method: "DELETE" });
    await load();
  }

  if (loading) return <Loading />;

  return (
    <section>
      <header className="topbar compact">
        <BackButton />
        <div>
          <p className="eyebrow">Log</p>
          <h1>Wins</h1>
        </div>
      </header>
      <ErrorBanner message={error} />
      <div className="action-row">
        <IconButton className="primary" type="button" onClick={() => setAddOpen(true)} icon={<Plus size={18} />}>
          Add Win
        </IconButton>
      </div>
      {!wins.length ? (
        <Empty>No wins logged yet.</Empty>
      ) : (
        <div className="stack">
          {wins.map((win) => (
            <article className="card win-card" key={win.id}>
              {editingId === win.id ? (
                <div className="form">
                  <textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} rows={4} />
                  <select value={editingProjectId} onChange={(event) => setEditingProjectId(event.target.value)}>
                    <option value="">No project</option>
                    {projects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                  <div className="small-actions">
                    <button className="icon-only" type="button" onClick={() => saveEdit(win)} aria-label="Save win" title="Save win">
                      <Check size={18} />
                    </button>
                    <button className="icon-only" type="button" onClick={() => setEditingId(null)} aria-label="Cancel edit" title="Cancel edit">
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <button className="unstyled win-main" type="button" onClick={() => startEdit(win)}>
                  <p>{win.body}</p>
                  <span>
                    {formatDateTime(win.created_at)}
                    {win.project_title ? <strong>{win.project_title}</strong> : null}
                  </span>
                </button>
              )}
              <button className="icon-only danger" type="button" onClick={() => deleteWin(win)} aria-label="Delete win" title="Delete win">
                <Trash2 size={18} />
              </button>
            </article>
          ))}
        </div>
      )}

      {addOpen ? (
        <div className="sheet-backdrop">
          <form className="sheet form" onSubmit={addWin}>
            <div className="section-heading">
              <h2>Add Win</h2>
              <button className="icon-only" type="button" onClick={() => setAddOpen(false)} aria-label="Close" title="Close">
                <X size={20} />
              </button>
            </div>
            <label>
              Win
              <textarea value={newBody} onChange={(event) => setNewBody(event.target.value)} rows={5} required />
            </label>
            <label>
              Project
              <select value={newProjectId} onChange={(event) => setNewProjectId(event.target.value)}>
                <option value="">No project</option>
                {projects.map((project) => (
                  <option value={project.id} key={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
            <IconButton className="primary" type="submit" icon={<Check size={18} />}>
              Save
            </IconButton>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function ProjectForm() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [startedAt, setStartedAt] = useState(todayInputValue());
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const { project } = await apiJson<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ title, goal, started_at: startedAt }),
      });
      navigate(`/projects/${project.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create project");
    }
  }

  return (
    <section>
      <header className="topbar compact">
        <BackButton />
        <h1>New Project</h1>
      </header>
      <ErrorBanner message={error} />
      <form className="form" onSubmit={submit}>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Goal
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={5} />
        </label>
        <label>
          Started
          <input type="date" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
        </label>
        <IconButton className="primary" type="submit" icon={<Check size={18} />}>
          Create
        </IconButton>
      </form>
    </section>
  );
}

function todayInputValue() {
  return localDateValue();
}

function ProjectScreen({ readOnly = false }: { readOnly?: boolean }) {
  const id = useSafeId();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [cycles, setCycles] = useState<ProtocolCycle[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [personName, setPersonName] = useState("");
  const [personNote, setPersonNote] = useState("");
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ project: nextProject }, { protocols: nextProtocols }, { people: nextPeople }, { cycles: nextCycles }] = await Promise.all([
        apiJson<{ project: Project }>(`/api/projects/${id}`),
        apiJson<{ protocols: Protocol[] }>(`/api/projects/${id}/protocols`),
        apiJson<{ people: Person[] }>(`/api/projects/${id}/people`),
        apiJson<{ cycles: ProtocolCycle[] }>(`/api/projects/${id}/cycles`),
      ]);
      setProject(nextProject);
      setProtocols(nextProtocols);
      setCycles(nextCycles);
      setPeople(nextPeople);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load project");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function completeProject() {
    if (!project || !window.confirm("Complete this project?")) return;
    await apiJson(`/api/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed", ended_at: new Date().toISOString() }),
    });
    navigate("/archive");
  }

  async function exportProject() {
    if (!project) return;
    const markdown = await apiText(`/api/projects/${project.id}/export`);
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "project"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function savePerson(event?: React.FormEvent | React.MouseEvent) {
    event?.preventDefault();
    const payload = editingPerson
      ? { name: editingPerson.name, note: editingPerson.note || "" }
      : { name: personName, note: personNote };
    const path = editingPerson ? `/api/projects/${id}/people/${editingPerson.id}` : `/api/projects/${id}/people`;
    const method = editingPerson ? "PATCH" : "POST";
    await apiJson(path, { method, body: JSON.stringify(payload) });
    setPersonName("");
    setPersonNote("");
    if (!editingPerson) setIsAddingPerson(false);
    setEditingPerson(null);
    await load();
  }

  async function removePerson(person: Person) {
    if (!window.confirm(`Remove ${person.name}?`)) return;
    await apiJson(`/api/projects/${id}/people/${person.id}`, { method: "DELETE" });
    await load();
  }

  if (loading) return <Loading />;
  if (!project) return <ErrorBanner message={error || "Project not found"} />;

  return (
    <section>
      <header className="topbar compact">
        <BackButton />
        <div>
          <h1>{project.title}</h1>
          <p className="meta">{project.status}</p>
        </div>
      </header>
      <ErrorBanner message={error} />
      {project.goal ? <p className="lead">{project.goal}</p> : null}
      <div className="action-row">
        <IconButton type="button" onClick={exportProject} icon={<Download size={18} />}>
          Export
        </IconButton>
        {!readOnly && project.status === "active" ? (
          <IconButton type="button" onClick={completeProject} icon={<Check size={18} />}>
            Complete
          </IconButton>
        ) : null}
      </div>

      <section className="section-block">
        <div className="section-heading">
          <h2>Protocols</h2>
          {!readOnly ? (
            <NavLink className="icon-only" to={`/projects/${id}/protocols/new`} aria-label="Add protocol" title="Add protocol">
              <Plus size={20} />
            </NavLink>
          ) : null}
        </div>
        {!protocols.length ? (
          <Empty>No protocols.</Empty>
        ) : (
          <div className="stack">
            {protocols.map((protocol) => (
              <NavLink className="card row-card" key={protocol.id} to={`/protocols/${protocol.id}`}>
                <div>
                  <h3>{protocol.title}</h3>
                  {protocol.goal ? <p>{protocol.goal}</p> : null}
                  <DeadlineBadge value={protocol.deadline} />
                </div>
                <ClipboardList size={20} />
              </NavLink>
            ))}
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>Cycle Archive</h2>
          <span className="meta">{cycles.length}</span>
        </div>
        {!cycles.length ? <Empty>No completed cycles yet.</Empty> : null}
        <div className="stack">
          {cycles.map((cycle) => (
            <article className="card cycle-card" key={cycle.id}>
              <div className="cycle-card-head">
                <div>
                  <h3>{cycle.protocol_title}</h3>
                  <p className="meta">{formatDateTime(cycle.completed_at)}</p>
                </div>
                {cycle.protocol_id ? (
                  <NavLink className="icon-only" to={`/protocols/${cycle.protocol_id}`} aria-label="Open protocol" title="Open protocol">
                    <Folder size={18} />
                  </NavLink>
                ) : null}
              </div>
              {cycle.synthesis ? (
                <div className="markdown-body cycle-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cycle.synthesis}</ReactMarkdown>
                </div>
              ) : null}
              {cycle.results ? (
                <div className="cycle-field">
                  <span>Results</span>
                  <p>{cycle.results}</p>
                </div>
              ) : null}
              {cycle.notes ? (
                <div className="cycle-field">
                  <span>Notes</span>
                  <p>{cycle.notes}</p>
                </div>
              ) : null}
              {cycle.photos.length ? (
                <div className="photo-strip">
                  {cycle.photos.map((photo) => (
                    <img key={photo.id} src={photo.r2_url} alt={photo.caption || "Cycle photo"} />
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>People</h2>
          {!readOnly ? (
            <button
              type="button"
              className="icon-only"
              onClick={() => {
                setIsAddingPerson((current) => !current);
                setPersonName("");
                setPersonNote("");
                setEditingPerson(null);
              }}
              aria-label={isAddingPerson ? "Cancel adding person" : "Add person"}
              title={isAddingPerson ? "Cancel adding person" : "Add person"}
            >
              {isAddingPerson ? <X size={20} /> : <Plus size={20} />}
            </button>
          ) : null}
        </div>
        {!people.length ? <Empty>No people.</Empty> : null}
        <div className="stack compact-stack">
          {people.map((person) => (
            <article className="card person-card" key={person.id}>
              {editingPerson?.id === person.id ? (
                <div className="inline-edit">
                  <input
                    value={editingPerson.name}
                    onChange={(event) => setEditingPerson({ ...editingPerson, name: event.target.value })}
                  />
                  <textarea
                    value={editingPerson.note || ""}
                    onChange={(event) => setEditingPerson({ ...editingPerson, note: event.target.value })}
                    rows={2}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="unstyled person-main"
                  onClick={() => {
                    if (readOnly) return;
                    setIsAddingPerson(false);
                    setEditingPerson(person);
                  }}
                >
                  <strong>{person.name}</strong>
                  {person.note ? <span>{person.note}</span> : null}
                </button>
              )}
              {!readOnly ? (
                <div className="small-actions">
                  {editingPerson?.id === person.id ? (
                    <button type="button" className="icon-only" onClick={savePerson} aria-label="Save person" title="Save person">
                      <Check size={18} />
                    </button>
                  ) : null}
                  <button type="button" className="icon-only danger" onClick={() => removePerson(person)} aria-label="Remove person" title="Remove person">
                    <Trash2 size={18} />
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
        {!readOnly && isAddingPerson ? (
          <form className="form inline-form" onSubmit={savePerson}>
            <label>
              Name
              <input value={personName} onChange={(event) => setPersonName(event.target.value)} required />
            </label>
            <label>
              Note
              <input value={personNote} onChange={(event) => setPersonNote(event.target.value)} />
            </label>
            <IconButton type="submit" icon={<UserPlus size={18} />}>
              Add
            </IconButton>
          </form>
        ) : null}
      </section>
    </section>
  );
}

function ProtocolForm() {
  const projectId = useSafeId();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [intervention, setIntervention] = useState("");
  const [metrics, setMetrics] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const { protocol } = await apiJson<{ protocol: Protocol }>(`/api/projects/${projectId}/protocols`, {
        method: "POST",
        body: JSON.stringify({ title, goal, intervention, metrics, deadline }),
      });
      navigate(`/protocols/${protocol.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create protocol");
    }
  }

  return (
    <section>
      <header className="topbar compact">
        <BackButton />
        <h1>New Protocol</h1>
      </header>
      <ErrorBanner message={error} />
      <form className="form" onSubmit={submit}>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Goal
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={3} />
        </label>
        <label>
          Intervention
          <textarea value={intervention} onChange={(event) => setIntervention(event.target.value)} rows={4} />
        </label>
        <label>
          Metrics
          <textarea value={metrics} onChange={(event) => setMetrics(event.target.value)} rows={4} />
        </label>
        <label>
          Deadline
          <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
        </label>
        <IconButton className="primary" type="submit" icon={<Check size={18} />}>
          Create
        </IconButton>
      </form>
    </section>
  );
}

function ProtocolScreen({ openEntryOnMount = false }: { openEntryOnMount?: boolean }) {
  const id = useSafeId();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [entryOpen, setEntryOpen] = useState(openEntryOnMount);
  const [todoOpen, setTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [protocolEditing, setProtocolEditing] = useState(false);
  const [protocolTitle, setProtocolTitle] = useState("");
  const [protocolGoal, setProtocolGoal] = useState("");
  const [protocolIntervention, setProtocolIntervention] = useState("");
  const [protocolMetrics, setProtocolMetrics] = useState("");
  const [protocolDeadline, setProtocolDeadline] = useState("");
  const [protocolStatus, setProtocolStatus] = useState<Protocol["status"]>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ protocol: nextProtocol }, { entries: nextEntries }, { todos: nextTodos }] = await Promise.all([
        apiJson<{ protocol: Protocol }>(`/api/protocols/${id}`),
        apiJson<{ entries: Entry[] }>(`/api/protocols/${id}/entries`),
        apiJson<{ todos: Todo[] }>(`/api/protocols/${id}/todos`),
      ]);
      setProtocol(nextProtocol);
      setProtocolTitle(nextProtocol.title);
      setProtocolGoal(nextProtocol.goal || "");
      setProtocolIntervention(nextProtocol.intervention || "");
      setProtocolMetrics(nextProtocol.metrics || "");
      setProtocolDeadline(nextProtocol.deadline || "");
      setProtocolStatus(nextProtocol.status);
      setEntries(nextEntries);
      setTodos(nextTodos);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load protocol");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function toggleTodo(todo: Todo) {
    await apiJson(`/api/todos/${todo.id}`, {
      method: "PATCH",
      body: JSON.stringify({ done: todo.done ? 0 : 1 }),
    });
    await load();
  }

  function cancelProtocolEdit() {
    if (!protocol) return;
    setProtocolTitle(protocol.title);
    setProtocolGoal(protocol.goal || "");
    setProtocolIntervention(protocol.intervention || "");
    setProtocolMetrics(protocol.metrics || "");
    setProtocolDeadline(protocol.deadline || "");
    setProtocolStatus(protocol.status);
    setProtocolEditing(false);
  }

  async function saveProtocolDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!protocol) return;
    setError(null);
    try {
      const { protocol: nextProtocol } = await apiJson<{ protocol: Protocol }>(`/api/protocols/${protocol.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: protocolTitle,
          goal: protocolGoal,
          intervention: protocolIntervention,
          metrics: protocolMetrics,
          deadline: protocolDeadline,
          status: protocolStatus,
        }),
      });
      setProtocol(nextProtocol);
      setProtocolTitle(nextProtocol.title);
      setProtocolGoal(nextProtocol.goal || "");
      setProtocolIntervention(nextProtocol.intervention || "");
      setProtocolMetrics(nextProtocol.metrics || "");
      setProtocolDeadline(nextProtocol.deadline || "");
      setProtocolStatus(nextProtocol.status);
      setProtocolEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save protocol details");
    }
  }

  if (loading) return <Loading />;
  if (!protocol) return <ErrorBanner message={error || "Protocol not found"} />;

  const openTodos = todos.filter((todo) => !todo.done);
  const doneTodos = todos.filter((todo) => todo.done);

  return (
    <section>
      <header className="topbar compact">
        <BackButton />
        <div>
          <h1>{protocol.title}</h1>
          <p className="meta">{protocol.status}</p>
        </div>
      </header>
      <ErrorBanner message={error} />
      {protocolEditing ? (
        <form className="form protocol-details-form" onSubmit={saveProtocolDetails}>
          <label>
            Title
            <input value={protocolTitle} onChange={(event) => setProtocolTitle(event.target.value)} required />
          </label>
          <label>
            Goal
            <textarea value={protocolGoal} onChange={(event) => setProtocolGoal(event.target.value)} rows={3} />
          </label>
          <label>
            Intervention
            <textarea value={protocolIntervention} onChange={(event) => setProtocolIntervention(event.target.value)} rows={4} />
          </label>
          <label>
            Metrics
            <textarea value={protocolMetrics} onChange={(event) => setProtocolMetrics(event.target.value)} rows={4} />
          </label>
          <label>
            Deadline
            <input type="date" value={protocolDeadline} onChange={(event) => setProtocolDeadline(event.target.value)} required />
          </label>
          <label>
            Status
            <select value={protocolStatus} onChange={(event) => setProtocolStatus(event.target.value as Protocol["status"])}>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <div className="action-row">
            <IconButton className="primary" type="submit" icon={<Check size={18} />}>
              Save
            </IconButton>
            <IconButton type="button" onClick={cancelProtocolEdit} icon={<X size={18} />}>
              Cancel
            </IconButton>
          </div>
        </form>
      ) : (
        <>
          <div className="action-row">
            <IconButton className="primary" type="button" onClick={() => setCycleOpen(true)} icon={<Archive size={18} />}>
              Complete Cycle
            </IconButton>
            <IconButton type="button" onClick={() => setProtocolEditing(true)} icon={<Pencil size={18} />}>
              Edit Details
            </IconButton>
          </div>
          <div className="detail-grid">
            {protocol.goal ? <Detail label="Goal" value={protocol.goal} /> : null}
            {protocol.intervention ? <Detail label="Intervention" value={protocol.intervention} /> : null}
            {protocol.metrics ? <Detail label="Metrics" value={protocol.metrics} /> : null}
            {protocol.deadline ? <Detail label="Deadline" value={formatDueDate(protocol.deadline)} /> : null}
          </div>
        </>
      )}

      <section className="section-block">
        <div className="section-heading">
          <h2>Entries</h2>
          <button type="button" className="icon-only" onClick={() => setEntryOpen(true)} aria-label="Add note" title="Add note">
            <Plus size={20} />
          </button>
        </div>
        {!entries.length ? <Empty>No entries.</Empty> : null}
        <div className="stack">
          {entries.map((entry) => (
            <article className="card entry-card" key={entry.id}>
              <p className="meta">{formatDateTime(entry.created_at)}</p>
              {entry.body ? <p className="entry-body">{entry.body}</p> : null}
              {entry.tags.length ? (
                <div className="tag-row">
                  {entry.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {entry.photos.length ? (
                <div className="photo-strip">
                  {entry.photos.map((photo) => (
                    <img key={photo.id} src={photo.r2_url} alt={photo.caption || "Entry photo"} />
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>To-dos</h2>
          <button type="button" className="icon-only" onClick={() => setTodoOpen(true)} aria-label="Add to-do" title="Add to-do">
            <Plus size={20} />
          </button>
        </div>
        {!todos.length ? <Empty>No to-dos.</Empty> : null}
        <div className="todo-list">
          {[...openTodos, ...doneTodos].map((todo) => (
            <article className={`todo ${todo.done ? "done" : ""}`} key={todo.id} onClick={() => setEditingTodo(todo)}>
              <input
                type="checkbox"
                checked={Boolean(todo.done)}
                onChange={() => toggleTodo(todo)}
                onClick={(event) => event.stopPropagation()}
              />
              <span>
                <strong>{todo.body}</strong>
                <DeadlineBadge value={todo.due_date} />
                <TodoRecurrenceBadge todo={todo} />
                <TodoAssigneeBadges todo={todo} />
              </span>
            </article>
          ))}
        </div>
      </section>

      {entryOpen ? <EntrySheet protocolId={id} onClose={() => setEntryOpen(false)} onSaved={load} /> : null}
      {cycleOpen ? (
        <CycleCompletionSheet protocol={protocol} onClose={() => setCycleOpen(false)} onSaved={load} />
      ) : null}
      {todoOpen ? (
        <TodoSheet fixedProtocolId={id} onClose={() => setTodoOpen(false)} onSaved={load} />
      ) : null}
      {editingTodo ? (
        <TodoSheet
          fixedProtocolId={editingTodo.protocol_id}
          onClose={() => setEditingTodo(null)}
          onSaved={load}
          todo={editingTodo}
        />
      ) : null}
    </section>
  );
}

function CycleCompletionSheet({
  onClose,
  onSaved,
  protocol,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  protocol: Protocol;
}) {
  const [synthesis, setSynthesis] = useState("");
  const [notes, setNotes] = useState("");
  const [results, setResults] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [drafting, setDrafting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setDrafting(true);
    setError(null);
    apiJson<{ synthesis: string }>(`/api/protocols/${protocol.id}/cycle-draft`, { method: "POST" })
      .then(({ synthesis: nextSynthesis }) => {
        if (active) setSynthesis(nextSynthesis);
      })
      .catch((draftError) => {
        if (active) setError(draftError instanceof Error ? draftError.message : "Could not generate synthesis");
      })
      .finally(() => {
        if (active) setDrafting(false);
      });
    return () => {
      active = false;
    };
  }, [protocol.id]);

  function isDirty() {
    return Boolean(synthesis.trim() || notes.trim() || results.trim() || files.length);
  }

  function requestClose() {
    if (isDirty() && !window.confirm("Discard this cycle draft?")) return;
    onClose();
  }

  function addFiles(fileList: FileList | null) {
    const nextFiles = Array.from(fileList || []);
    if (!nextFiles.length) return;
    setFiles((current) => [...current, ...nextFiles]);
  }

  function appendTranscript(text: string) {
    setNotes((current) => {
      const nextText = text.trim();
      return current.trim() ? `${current.replace(/\s+$/, "")}\n${nextText}` : nextText;
    });
  }

  function releaseRecorder() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function transcribeAudio(blob: Blob) {
    setTranscribing(true);
    setTranscriptionError(null);
    try {
      const wav = await recordingToWav(blob);
      const form = new FormData();
      form.append("audio", wav, "cycle-note.wav");
      const { text } = await apiJson<{ text: string }>("/api/transcribe-audio", { method: "POST", body: form });
      if (text && text.trim()) appendTranscript(text);
      else setTranscriptionError("No speech detected — try again");
    } catch {
      setTranscriptionError("Transcription failed — try again");
    } finally {
      setTranscribing(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  async function startRecording() {
    setTranscriptionError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setTranscriptionError("Recording isn't supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        releaseRecorder();
        setRecording(false);
        setElapsed(0);
        if (blob.size > 0) void transcribeAudio(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed((seconds) => {
          const next = seconds + 1;
          if (next >= MAX_RECORDING_SECONDS) stopRecording();
          return next;
        });
      }, 1000);
    } catch {
      setTranscriptionError("Microphone access denied");
      releaseRecorder();
    }
  }

  useEffect(
    () => () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      releaseRecorder();
    },
    [],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { cycle } = await apiJson<{ cycle: ProtocolCycle }>(`/api/protocols/${protocol.id}/cycles`, {
        method: "POST",
        body: JSON.stringify({
          synthesis,
          notes,
          results,
          completed_at: new Date().toISOString(),
        }),
      });
      for (const [index, file] of files.entries()) {
        await uploadCyclePhoto(cycle.id, file, (fileProgress) => {
          setProgress(Math.round(((index + fileProgress / 100) / files.length) * 100));
        });
      }
      setProgress(null);
      await onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not complete cycle");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet className="form todo-sheet cycle-sheet" onClose={requestClose} onSubmit={submit}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Protocol cycle</p>
          <h2>Complete Cycle</h2>
        </div>
        <div className="small-actions">
          <button className="icon-only primary-icon" type="submit" disabled={saving || drafting} aria-label="Save cycle" title="Save cycle">
            <Check size={20} />
          </button>
          <button type="button" className="icon-only" onClick={requestClose} aria-label="Close" title="Close">
            <X size={20} />
          </button>
        </div>
      </div>
      <ErrorBanner message={error} />
      <label>
        Synthesis
        <div className="entry-body-field">
          <textarea
            value={synthesis}
            onChange={(event) => setSynthesis(event.target.value)}
            placeholder={drafting ? "Generating synthesis..." : "Cycle synthesis"}
            rows={12}
          />
          {drafting ? <span className="transcription-state">Generating...</span> : null}
        </div>
      </label>
      <label>
        Results
        <textarea
          value={results}
          onChange={(event) => setResults(event.target.value)}
          placeholder="What changed, what moved, what measured result matters?"
          rows={5}
        />
      </label>
      <label>
        Notes / voice transcript
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add your own reflections, corrections, or a transcribed voice memo."
          rows={6}
        />
      </label>
      <div className="transcription-actions">
        <button
          className={`button${recording ? " danger" : ""}`}
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing || saving}
        >
          {recording ? <Square size={18} /> : <Mic size={18} />}
          <span>
            {recording
              ? `Stop · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
              : transcribing
                ? "Transcribing..."
                : "Record voice note"}
          </span>
        </button>
        {transcriptionError ? <span className="inline-error">{transcriptionError}</span> : null}
      </div>
      <div className="field-group">
        <span className="field-label">Photos</span>
        <div className="entry-photo-actions">
          <button className="button" type="button" onClick={() => cameraInputRef.current?.click()} disabled={saving}>
            <Camera size={18} />
            <span>Take photo</span>
          </button>
          <button className="button" type="button" onClick={() => photoInputRef.current?.click()} disabled={saving}>
            <Plus size={18} />
            <span>Add photos</span>
          </button>
        </div>
        <input
          ref={cameraInputRef}
          className="hidden-file-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={photoInputRef}
          className="hidden-file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {files.length ? (
        <div className="file-list">
          <Camera size={18} />
          <span>{files.length} selected</span>
          <button className="file-clear-button" type="button" onClick={() => setFiles([])} aria-label="Clear selected photos" title="Clear selected photos">
            <X size={16} />
          </button>
          {progress !== null ? <progress value={progress} max={100} /> : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

function uploadPhoto(entryId: string, file: File, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append("photo", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/entries/${entryId}/photos`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.responseText || "Photo upload failed"));
    };
    xhr.onerror = () => reject(new Error("Photo upload failed"));
    xhr.send(form);
  });
}

function uploadCyclePhoto(cycleId: string, file: File, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append("photo", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/protocol-cycles/${cycleId}/photos`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.responseText || "Photo upload failed"));
    };
    xhr.onerror = () => reject(new Error("Photo upload failed"));
    xhr.send(form);
  });
}

function EntrySheet({ protocolId, onClose, onSaved }: { protocolId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [createdAt, setCreatedAt] = useState(localDateTimeValue());
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  function addFiles(fileList: FileList | null) {
    const nextFiles = Array.from(fileList || []);
    if (!nextFiles.length) return;
    setFiles((current) => [...current, ...nextFiles]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const { entry } = await apiJson<{ entry: Entry }>(`/api/protocols/${protocolId}/entries`, {
        method: "POST",
        body: JSON.stringify({
          created_at: new Date(createdAt).toISOString(),
          body,
          tags: tags.split(","),
        }),
      });
      for (const [index, file] of files.entries()) {
        await uploadPhoto(entry.id, file, (fileProgress) => {
          setProgress(Math.round(((index + fileProgress / 100) / files.length) * 100));
        });
      }
      setProgress(null);
      await onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save entry");
    }
  }

  return (
    <div className="sheet-backdrop">
      <form className="sheet form" onSubmit={submit}>
        <div className="section-heading">
          <h2>New Entry</h2>
          <button type="button" className="icon-only" onClick={onClose} aria-label="Close" title="Close">
            <X size={20} />
          </button>
        </div>
        <ErrorBanner message={error} />
        <label>
          Date
          <input type="datetime-local" value={createdAt} onChange={(event) => setCreatedAt(event.target.value)} />
        </label>
        <label>
          Body
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} />
        </label>
        <label>
          Tags
          <input className="mono-input" value={tags} onChange={(event) => setTags(event.target.value)} />
        </label>
        <div className="field-group">
          <span className="field-label">Photos</span>
          <div className="entry-photo-actions">
            <button className="button" type="button" onClick={() => cameraInputRef.current?.click()}>
              <Camera size={18} />
              <span>Take photo</span>
            </button>
            <button className="button" type="button" onClick={() => photoInputRef.current?.click()}>
              <Plus size={18} />
              <span>Add photos</span>
            </button>
          </div>
          <input
            ref={cameraInputRef}
            className="hidden-file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={photoInputRef}
            className="hidden-file-input"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        {files.length ? (
          <div className="file-list">
            <Camera size={18} />
            <span>{files.length} selected</span>
            <button className="file-clear-button" type="button" onClick={() => setFiles([])} aria-label="Clear selected photos" title="Clear selected photos">
              <X size={16} />
            </button>
            {progress !== null ? <progress value={progress} max={100} /> : null}
          </div>
        ) : null}
        <IconButton className="primary" type="submit" icon={<Check size={18} />}>
          Save
        </IconButton>
      </form>
    </div>
  );
}

function PeopleDirectoryScreen() {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { people: nextPeople } = await apiJson<{ people: DirectoryPerson[] }>("/api/people");
      setPeople(nextPeople);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load people");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    return people.filter((person) => !query || person.name.toLowerCase().includes(query));
  }, [people, search]);

  function togglePerson(person: DirectoryPerson) {
    if (expandedId === person.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(person.id);
    setDraftName(person.name);
    setDraftNote(person.note || "");
  }

  async function savePerson(person: DirectoryPerson) {
    await apiJson(`/api/people/${person.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: draftName, note: draftNote }),
    });
    setExpandedId(null);
    await load();
  }

  async function deletePerson(person: DirectoryPerson) {
    if (!window.confirm(`Remove ${person.name} from the directory? They will be removed from all to-dos and projects.`)) return;
    await apiJson(`/api/people/${person.id}`, { method: "DELETE" });
    setExpandedId(null);
    await load();
  }

  async function addPerson(event: React.FormEvent) {
    event.preventDefault();
    await apiJson("/api/people", {
      method: "POST",
      body: JSON.stringify({ name: newName, note: newNote }),
    });
    setNewName("");
    setNewNote("");
    await load();
  }

  if (loading) return <Loading />;

  return (
    <section>
      <header className="topbar compact">
        <BackButton />
        <div>
          <p className="eyebrow">Directory</p>
          <h1>People</h1>
        </div>
      </header>
      <ErrorBanner message={error} />
      <label className="search-field">
        Search
        <input value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <div className="stack directory-list">
        {!filteredPeople.length ? <Empty>No people found.</Empty> : null}
        {filteredPeople.map((person) => {
          const expanded = expandedId === person.id;
          return (
            <article className="card directory-card" key={person.id}>
              <button className="unstyled directory-summary" type="button" onClick={() => togglePerson(person)}>
                <strong>{person.name}</strong>
                {person.note ? <span className="directory-note">{person.note}</span> : null}
                <span className="directory-projects">{person.projects.length ? person.projects.join(", ") : "No projects"}</span>
              </button>
              {expanded ? (
                <div className="directory-expanded">
                  <label>
                    Name
                    <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                  </label>
                  <label>
                    Note
                    <textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} rows={3} />
                  </label>
                  <div className="detail">
                    <span>Projects</span>
                    <p>{person.projects.length ? person.projects.join(", ") : "No projects"}</p>
                  </div>
                  <div className="action-row">
                    <IconButton className="primary" type="button" onClick={() => savePerson(person)} icon={<Check size={18} />}>
                      Save
                    </IconButton>
                    <button className="button danger" type="button" onClick={() => deletePerson(person)}>
                      <Trash2 size={18} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <form className="form inline-form directory-add-form" onSubmit={addPerson}>
        <label>
          Name
          <input value={newName} onChange={(event) => setNewName(event.target.value)} required />
        </label>
        <label>
          Note
          <input value={newNote} onChange={(event) => setNewNote(event.target.value)} />
        </label>
        <IconButton type="submit" icon={<UserPlus size={18} />}>
          Add person
        </IconButton>
      </form>
    </section>
  );
}

function ProjectsScreen() {
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [protocolsByProject, setProtocolsByProject] = useState<Record<string, Protocol[]>>({});
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const [renamingProjectId, setRenamingProjectId] = useState("");
  const [projectTitleDraft, setProjectTitleDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [vision, projectData] = await Promise.all([
        apiJson<{ body: string | null }>("/api/vision"),
        apiJson<{ projects: Project[] }>("/api/projects?status=active"),
      ]);
      const protocolPairs = await Promise.all(
        projectData.projects.map(async (project) => {
          const { protocols } = await apiJson<{ protocols: Protocol[] }>(`/api/projects/${project.id}/protocols`);
          return [project.id, protocols] as const;
        }),
      );
      setBody(vision.body || "");
      setDraft(vision.body || "");
      setProjects(projectData.projects);
      setProtocolsByProject(Object.fromEntries(protocolPairs));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    await apiJson("/api/vision", { method: "PUT", body: JSON.stringify({ body: draft }) });
    setBody(draft);
    setEditing(false);
  }

  function startProjectRename(project: Project) {
    setRenamingProjectId(project.id);
    setProjectTitleDraft(project.title);
  }

  function cancelProjectRename() {
    setRenamingProjectId("");
    setProjectTitleDraft("");
  }

  async function saveProjectTitle(project: Project) {
    setError(null);
    try {
      const { project: nextProject } = await apiJson<{ project: Project }>(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: projectTitleDraft }),
      });
      setProjects((current) => current.map((item) => (item.id === project.id ? nextProject : item)));
      cancelProjectRename();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not rename project");
    }
  }

  if (loading) return <Loading />;

  return (
    <section>
      <header className="topbar">
        <div>
          <p className="eyebrow">Direction</p>
          <h1>Projects</h1>
        </div>
        <div className="small-actions">
          <NavLink className="icon-only" to="/people" aria-label="People directory" title="People directory">
            <Users size={20} />
          </NavLink>
          <button className="button" type="button" onClick={() => (editing ? save() : setEditing(true))}>
            {editing ? <Check size={18} /> : <Eye size={18} />}
            <span>{editing ? "Save" : "Edit"}</span>
          </button>
        </div>
      </header>
      <ErrorBanner message={error} />
      <section>
        <div className="section-heading">
          <h2>Vision</h2>
        </div>
        {editing ? (
          <textarea className="vision-editor" value={draft} onChange={(event) => setDraft(event.target.value)} />
        ) : body ? (
          <article className="vision-body">{body}</article>
        ) : (
          <Empty>Set your vision.</Empty>
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>Projects</h2>
          <div className="small-actions">
            <span className="meta">{projects.length} active</span>
            <NavLink className="button primary" to="/projects/new">
              <Plus size={18} />
              <span>New Project</span>
            </NavLink>
          </div>
        </div>
        {!projects.length ? (
          <Empty>No active projects.</Empty>
        ) : (
          <div className="stack">
            {projects.map((project) => (
              <article className="card project-expand-card" key={project.id}>
                {renamingProjectId === project.id ? (
                  <form
                    className="project-rename-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveProjectTitle(project);
                    }}
                  >
                    <input
                      autoFocus
                      aria-label={`Project name for ${project.title}`}
                      value={projectTitleDraft}
                      onChange={(event) => setProjectTitleDraft(event.target.value)}
                      required
                    />
                    <div className="small-actions">
                      <button className="icon-only primary-icon" type="submit" aria-label="Save project name" title="Save project name">
                        <Check size={20} />
                      </button>
                      <button className="icon-only" type="button" onClick={cancelProjectRename} aria-label="Cancel rename" title="Cancel rename">
                        <X size={20} />
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="project-card-header">
                    <button
                      className="unstyled project-toggle"
                      type="button"
                      onClick={() =>
                        setExpandedProjectIds((ids) =>
                          ids.includes(project.id) ? ids.filter((id) => id !== project.id) : [...ids, project.id],
                        )
                      }
                    >
                      <div>
                        <h3>{project.title}</h3>
                        {project.goal ? <p>{project.goal}</p> : null}
                        <p className="meta">Started {formatDate(project.started_at)}</p>
                      </div>
                      <ChevronDown className={expandedProjectIds.includes(project.id) ? "rotate" : ""} size={20} />
                    </button>
                    <button
                      className="icon-only"
                      type="button"
                      onClick={() => startProjectRename(project)}
                      aria-label={`Edit ${project.title}`}
                      title="Edit project name"
                    >
                      <Pencil size={20} />
                    </button>
                  </div>
                )}
                {expandedProjectIds.includes(project.id) ? (
                  <div className="protocol-list">
                    <NavLink className="protocol-row" to={`/projects/${project.id}`}>
                      <div>
                        <strong>Project detail</strong>
                        <span>People, export, and controls</span>
                      </div>
                      <Folder size={18} />
                    </NavLink>
                    {(protocolsByProject[project.id] || []).map((protocol) => (
                      <NavLink className="protocol-row" key={protocol.id} to={`/protocols/${protocol.id}`}>
                        <div>
                          <strong>{protocol.title}</strong>
                          <span>{formatDateTime(protocol.last_entry_at)}</span>
                        </div>
                        <DeadlineBadge value={protocol.deadline} />
                      </NavLink>
                    ))}
                    {!protocolsByProject[project.id]?.length ? <p className="muted">No protocols yet.</p> : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section-block">
        <NavLink className="card row-card" to="/archive">
          <div>
            <h2>Archive</h2>
            <p>Completed projects</p>
          </div>
          <Archive size={20} />
        </NavLink>
      </section>
    </section>
  );
}

function ArchiveScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ projects: Project[] }>("/api/projects?status=completed")
      .then(({ projects: nextProjects }) => setProjects(nextProjects))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load archive"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <section>
      <header className="topbar">
        <div>
          <p className="eyebrow">Completed</p>
          <h1>Archive</h1>
        </div>
      </header>
      <ErrorBanner message={error} />
      {!projects.length ? (
        <Empty>No completed projects.</Empty>
      ) : (
        <div className="stack">
          {projects.map((project) => (
            <NavLink className="card" key={project.id} to={`/archive/${project.id}`}>
              <h2>{project.title}</h2>
              {project.goal ? <p>{project.goal}</p> : null}
              <p className="meta">
                {formatDate(project.started_at)} - {formatDate(project.ended_at)}
              </p>
            </NavLink>
          ))}
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
