import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  Camera,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  GripVertical,
  Eye,
  History,
  Home,
  LogOut,
  Plus,
  Settings,
  Trash2,
  Trophy,
  UserPlus,
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
};

type Photo = {
  id: string;
  entry_id: string;
  r2_url: string;
  caption: string | null;
  created_at: string;
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

type Todo = {
  id: string;
  protocol_id: string;
  body: string;
  done: 0 | 1;
  due_date: string | null;
  person_id: string | null;
  position: number | null;
  person_name?: string | null;
  person_role?: string | null;
  project_id?: string;
  project_title?: string;
  protocol_title?: string;
  created_at: string;
  updated_at: string;
};

type Person = {
  id: string;
  project_id: string;
  name: string;
  note: string | null;
  created_at: string;
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

function roleLabel(value: string | null | undefined) {
  return RASCI_ROLES.find((role) => role.value === value)?.label || "";
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

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/today" element={<TodayScreen />} />
            <Route path="/wins" element={<WinsScreen />} />
            <Route path="/vision" element={<VisionScreen />} />
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
      <NavLink to="/today">
        <CalendarDays size={20} />
        <span>Today</span>
      </NavLink>
      <NavLink to="/">
        <Home size={20} />
        <span>Dashboard</span>
      </NavLink>
      <NavLink to="/vision">
        <Eye size={20} />
        <span>Vision</span>
      </NavLink>
      <NavLink to="/archive">
        <Archive size={20} />
        <span>Archive</span>
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

function TodoPersonBadge({ todo }: { todo: Todo }) {
  if (!todo.person_name) return null;
  return (
    <em className="person-role-badge" title={todo.person_role ? roleLabel(todo.person_role) : undefined}>
      {todo.person_role ? `[${todo.person_role}] ` : ""}
      {todo.person_name}
    </em>
  );
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
          <TodoPersonBadge todo={todo} />
        </div>
      </div>
    </article>
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
  const [openSession, setOpenSession] = useState<CheckinSession>("morning");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(date = selectedDate) {
    setLoading(true);
    setError(null);
    try {
      const [templateData, entryData, dateData, protocolData] = await Promise.all([
        apiJson<{ templates: CheckinTemplatesBySession }>("/api/checkin/templates"),
        apiJson<{ entries: CheckinEntriesBySession }>(`/api/checkin/entries/${date}`),
        apiJson<{ dates: Array<{ date: string; sessions: string }> }>("/api/checkin/entries"),
        fetchActiveProtocolSummaries(),
      ]);
      setTemplates(templateData.templates);
      setEntries(entryData.entries);
      setAnswers({
        morning: answerMap(entryData.entries.morning),
        evening: answerMap(entryData.entries.evening),
      });
      setDates(dateData.dates);
      setActiveProtocols(protocolData);
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

  function selectPastDate(date: string) {
    setSelectedDate(date);
    setDatesOpen(false);
    setOpenSession("morning");
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
            onToggle={() => setOpenSession(openSession === session ? (session === "morning" ? "evening" : "morning") : session)}
            readOnly={readOnly}
            session={session}
            templates={templates[session]}
          />
        ))}
      </div>

      <section className="section-block">
        <div className="section-heading">
          <h2>Active Protocols</h2>
        </div>
        {!activeProtocols.length ? <Empty>No active protocols.</Empty> : null}
        <div className="stack compact-stack">
          {activeProtocols.map((protocol) => (
            <NavLink className="protocol-summary-row" to={`/protocols/${protocol.id}`} key={protocol.id}>
              <div>
                <strong>{protocol.title}</strong>
                <span>{protocol.project_title}</span>
              </div>
              <DeadlineBadge value={protocol.deadline} />
            </NavLink>
          ))}
        </div>
      </section>

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
    </section>
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
          {!readOnly ? (
            <div className="action-row align-end">
              <IconButton type="button" className="primary" onClick={onSave} icon={<Check size={18} />}>
                Save
              </IconButton>
            </div>
          ) : null}
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
            templates.map((template) => (
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
            ))
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
          <h2>Check-in Settings</h2>
          <button className="icon-only" type="button" onClick={onClose} aria-label="Close" title="Close">
            <X size={20} />
          </button>
        </div>
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
  const [people, setPeople] = useState<Person[]>([]);
  const [personName, setPersonName] = useState("");
  const [personNote, setPersonNote] = useState("");
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ project: nextProject }, { protocols: nextProtocols }, { people: nextPeople }] = await Promise.all([
        apiJson<{ project: Project }>(`/api/projects/${id}`),
        apiJson<{ protocols: Protocol[] }>(`/api/projects/${id}/protocols`),
        apiJson<{ people: Person[] }>(`/api/projects/${id}/people`),
      ]);
      setProject(nextProject);
      setProtocols(nextProtocols);
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
    const path = editingPerson ? `/api/people/${editingPerson.id}` : `/api/projects/${id}/people`;
    const method = editingPerson ? "PATCH" : "POST";
    await apiJson(path, { method, body: JSON.stringify(payload) });
    setPersonName("");
    setPersonNote("");
    setEditingPerson(null);
    await load();
  }

  async function removePerson(person: Person) {
    if (!window.confirm(`Remove ${person.name}?`)) return;
    await apiJson(`/api/people/${person.id}`, { method: "DELETE" });
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
          <h2>People</h2>
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
                <button type="button" className="unstyled person-main" onClick={() => !readOnly && setEditingPerson(person)}>
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
        {!readOnly ? (
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
          <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
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
  const [people, setPeople] = useState<Person[]>([]);
  const [entryOpen, setEntryOpen] = useState(openEntryOnMount);
  const [todoBody, setTodoBody] = useState("");
  const [todoDue, setTodoDue] = useState("");
  const [todoPerson, setTodoPerson] = useState("");
  const [todoRole, setTodoRole] = useState("");
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
      const { people: nextPeople } = await apiJson<{ people: Person[] }>(`/api/projects/${nextProtocol.project_id}/people`);
      setProtocol(nextProtocol);
      setEntries(nextEntries);
      setTodos(nextTodos);
      setPeople(nextPeople);
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

  async function addTodo(event: React.FormEvent) {
    event.preventDefault();
    await apiJson(`/api/protocols/${id}/todos`, {
      method: "POST",
      body: JSON.stringify({ body: todoBody, due_date: todoDue, person_id: todoPerson, person_role: todoRole }),
    });
    setTodoBody("");
    setTodoDue("");
    setTodoPerson("");
    setTodoRole("");
    await load();
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
      <div className="detail-grid">
        {protocol.goal ? <Detail label="Goal" value={protocol.goal} /> : null}
        {protocol.intervention ? <Detail label="Intervention" value={protocol.intervention} /> : null}
        {protocol.metrics ? <Detail label="Metrics" value={protocol.metrics} /> : null}
        {protocol.deadline ? <Detail label="Deadline" value={formatDueDate(protocol.deadline)} /> : null}
      </div>

      <section className="section-block">
        <div className="section-heading">
          <h2>Entries</h2>
          <button type="button" className="icon-only" onClick={() => setEntryOpen(true)} aria-label="Add entry" title="Add entry">
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
        </div>
        {!todos.length ? <Empty>No to-dos.</Empty> : null}
        <div className="todo-list">
          {[...openTodos, ...doneTodos].map((todo) => (
            <label className={`todo ${todo.done ? "done" : ""}`} key={todo.id}>
              <input type="checkbox" checked={Boolean(todo.done)} onChange={() => toggleTodo(todo)} />
              <span>
                <strong>{todo.body}</strong>
                <DeadlineBadge value={todo.due_date} />
                <TodoPersonBadge todo={todo} />
              </span>
            </label>
          ))}
        </div>
        <form className="form inline-form" onSubmit={addTodo}>
          <label>
            To-do
            <input value={todoBody} onChange={(event) => setTodoBody(event.target.value)} required />
          </label>
          <label>
            Due
            <input type="date" value={todoDue} onChange={(event) => setTodoDue(event.target.value)} />
          </label>
          <label>
            Person
            <select
              value={todoPerson}
              onChange={(event) => {
                setTodoPerson(event.target.value);
                if (!event.target.value) setTodoRole("");
              }}
            >
              <option value="">None</option>
              {people.map((person) => (
                <option value={person.id} key={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          {todoPerson ? (
            <div className="field-group">
              <span className="field-label">Role</span>
              <div className="rasci-control" role="group" aria-label="RASCI role">
                {RASCI_ROLES.map((role) => (
                  <button
                    aria-pressed={todoRole === role.value}
                    className={`role-chip ${todoRole === role.value ? "active" : ""}`}
                    key={role.value}
                    onClick={() => setTodoRole((current) => (current === role.value ? "" : role.value))}
                    title={role.label}
                    type="button"
                  >
                    {role.value}
                  </button>
                ))}
              </div>
              <span className="helper-text">{todoRole ? roleLabel(todoRole) : "Optional"}</span>
            </div>
          ) : null}
          <IconButton type="submit" icon={<Plus size={18} />}>
            Add
          </IconButton>
        </form>
      </section>

      {entryOpen ? <EntrySheet protocolId={id} onClose={() => setEntryOpen(false)} onSaved={load} /> : null}
    </section>
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

function EntrySheet({ protocolId, onClose, onSaved }: { protocolId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [createdAt, setCreatedAt] = useState(localDateTimeValue());
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <label>
          Photos
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
          />
        </label>
        {files.length ? (
          <div className="file-list">
            <Camera size={18} />
            <span>{files.length} selected</span>
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

function VisionScreen() {
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const vision = await apiJson<{ body: string | null }>("/api/vision");
      setBody(vision.body || "");
      setDraft(vision.body || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load vision");
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

  if (loading) return <Loading />;

  return (
    <section>
      <header className="topbar">
        <div>
          <p className="eyebrow">Direction</p>
          <h1>Vision</h1>
        </div>
        <button className="button" type="button" onClick={() => (editing ? save() : setEditing(true))}>
          {editing ? <Check size={18} /> : <Eye size={18} />}
          <span>{editing ? "Save" : "Edit"}</span>
        </button>
      </header>
      <ErrorBanner message={error} />
      {editing ? (
        <textarea className="vision-editor" value={draft} onChange={(event) => setDraft(event.target.value)} />
      ) : body ? (
        <article className="vision-body">{body}</article>
      ) : (
        <Empty>Set your vision.</Empty>
      )}
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
