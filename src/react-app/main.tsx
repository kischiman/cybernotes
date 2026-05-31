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
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
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
  project_started_at?: string | null;
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

function roleLabel(value: string | null | undefined) {
  return RASCI_ROLES.find((role) => role.value === value)?.label || "";
}

const GANTT_PROJECT_COLORS = ["#0066FF", "#00A36C", "#E85D04", "#7B2FBE", "#C9184A", "#0096C7", "#606C38", "#AE2012"];
const GANTT_DAY_WIDTH = 60;

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
            <Route path="/" element={<TodayScreen />} />
            <Route path="/today" element={<Navigate to="/" replace />} />
            <Route path="/protocols" element={<ProtocolsGanttScreen />} />
            <Route path="/wins" element={<WinsScreen />} />
            <Route path="/projects" element={<ProjectsScreen />} />
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

function TodoPersonBadge({ showRole = true, todo }: { showRole?: boolean; todo: Todo }) {
  if (!todo.person_name) return null;
  if (!showRole) {
    return <em className="todo-person-inline">· {todo.person_name}</em>;
  }
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

function ProtocolsGanttScreen() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ protocols: Protocol[] }>("/api/protocols/active")
      .then(({ protocols: nextProtocols }) => setProtocols(nextProtocols.filter((protocol) => protocol.deadline)))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load protocols"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const today = localDateValue();
  const maxDeadline = maxDateString(...protocols.map((protocol) => protocol.deadline));
  const endDate = maxDateString(addDays(today, 6), maxDeadline);
  const days = buildDateRange(today, endDate);
  const chartWidth = days.length * GANTT_DAY_WIDTH;
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
      </header>
      <ErrorBanner message={error} />
      {!protocols.length ? (
        <Empty>No active protocols with deadlines</Empty>
      ) : (
        <div className="gantt-scroll" aria-label="Active protocol timeline">
          <div className="gantt-chart" style={{ width: chartWidth }}>
            <div className="gantt-header" style={{ gridTemplateColumns: `repeat(${days.length}, ${GANTT_DAY_WIDTH}px)` }}>
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
                      backgroundColor: hexToRgba(group.color, 0.15),
                      borderLeftColor: group.color,
                      width: chartWidth,
                    }}
                  >
                    {group.projectTitle}
                  </div>
                  {group.protocols.map((protocol) => (
                    <GanttProtocolRow chartWidth={chartWidth} color={group.color} days={days} key={protocol.id} protocol={protocol} today={today} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function GanttProtocolRow({
  chartWidth,
  color,
  days,
  protocol,
  today,
}: {
  chartWidth: number;
  color: string;
  days: string[];
  protocol: Protocol;
  today: string;
}) {
  const start = minDateString(dateOnly(protocol.created_at), dateOnly(protocol.project_started_at));
  const deadline = dateOnly(protocol.deadline);
  const rawStartIndex = daysBetween(today, start);
  const leftIndex = Math.max(0, rawStartIndex);
  const endIndex = Math.max(leftIndex, daysBetween(today, deadline));
  const left = leftIndex * GANTT_DAY_WIDTH;
  const width = Math.max(GANTT_DAY_WIDTH, (endIndex - leftIndex + 1) * GANTT_DAY_WIDTH);
  const clipped = rawStartIndex < 0;
  const canShowLabel = width >= 96;

  return (
    <div className="gantt-row" style={{ width: chartWidth }}>
      <div className="gantt-row-columns" style={{ gridTemplateColumns: `repeat(${days.length}, ${GANTT_DAY_WIDTH}px)` }}>
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
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [openSession, setOpenSession] = useState<CheckinSession | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
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
        <div className="add-todo-row">
          <IconButton type="button" onClick={() => setAddTodoOpen(true)} icon={<Plus size={18} />}>
            Add to-do
          </IconButton>
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
              completedToday.map((todo) => (
                <TodayTodoItem completing={false} key={todo.id} onEdit={() => setEditingTodo(todo)} todo={todo} />
              ))
            ) : (
              <Empty>Nothing completed today yet.</Empty>
            )}
          </div>
        ) : null}
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

      {addTodoOpen ? (
        <TodoSheet
          onClose={() => setAddTodoOpen(false)}
          onSaved={() => load(selectedDate)}
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
          <TodoPersonBadge showRole={false} todo={todo} />
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
          <TodoPersonBadge showRole={false} todo={todo} />
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

function todoSheetSnapshot(protocolId: string, body: string, dueDate: string, assignees: TodoAssigneeDraft[]) {
  return JSON.stringify({
    protocolId,
    body: body.trim(),
    dueDate,
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
  protocols = [],
  todo,
}: {
  fixedProtocolId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  protocols?: Protocol[];
  todo?: Todo | null;
}) {
  const initial = useRef({
    protocolId: fixedProtocolId || todo?.protocol_id || protocols[0]?.id || "",
    body: todo?.body || "",
    dueDate: todo?.due_date || "",
    assignees: (todo?.assignees || []).map(assigneeDraftFromTodo),
  });
  const [protocolId, setProtocolId] = useState(initial.current.protocolId);
  const [body, setBody] = useState(initial.current.body);
  const [dueDate, setDueDate] = useState(initial.current.dueDate);
  const [assignees, setAssignees] = useState<TodoAssigneeDraft[]>(initial.current.assignees);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLInputElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const initialSnapshot = useRef(
    todoSheetSnapshot(initial.current.protocolId, initial.current.body, initial.current.dueDate, initial.current.assignees),
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
    return todoSheetSnapshot(protocolId, body, dueDate, assignees) !== initialSnapshot.current;
  }

  function requestClose() {
    if (isDirty() && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }

  function updateAssignee(key: string, updater: (row: TodoAssigneeDraft) => TodoAssigneeDraft) {
    setAssignees((current) => current.map((row) => (row.key === key ? updater(row) : row)));
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
    setError(null);
    try {
      if (todo) {
        await apiJson(`/api/todos/${todo.id}`, {
          method: "PATCH",
          body: JSON.stringify({ body, due_date: dueDate }),
        });
        await syncAssignees(todo.id, nextAssignees);
      } else {
        await apiJson(`/api/protocols/${selectedProtocolId}/todos`, {
          method: "POST",
          body: JSON.stringify({
            body,
            due_date: dueDate,
            assignees: nextAssignees.map((assignee) => ({ person_id: assignee.person_id, role: assignee.role })),
          }),
        });
      }
      await onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save to-do");
    }
  }

  return (
    <div className="sheet-backdrop" onClick={requestClose}>
      <form
        className="sheet form todo-sheet"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        onTouchEnd={(event) => {
          const startY = touchStartY.current;
          const endY = event.changedTouches[0]?.clientY ?? startY;
          touchStartY.current = null;
          if (startY !== null && endY !== null && endY - startY > 80) requestClose();
        }}
        onTouchStart={(event) => {
          touchStartY.current = event.touches[0]?.clientY ?? null;
        }}
      >
        <div className="sheet-grabber" aria-hidden="true" />
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
      </form>
    </div>
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
                <TodoPersonBadge todo={todo} />
              </span>
            </article>
          ))}
        </div>
      </section>

      {entryOpen ? <EntrySheet protocolId={id} onClose={() => setEntryOpen(false)} onSaved={load} /> : null}
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

function ProjectsScreen() {
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [protocolsByProject, setProtocolsByProject] = useState<Record<string, Protocol[]>>({});
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
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

  if (loading) return <Loading />;

  return (
    <section>
      <header className="topbar">
        <div>
          <p className="eyebrow">Direction</p>
          <h1>Projects</h1>
        </div>
        <button className="button" type="button" onClick={() => (editing ? save() : setEditing(true))}>
          {editing ? <Check size={18} /> : <Eye size={18} />}
          <span>{editing ? "Save" : "Edit"}</span>
        </button>
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
          <span className="meta">{projects.length} active</span>
        </div>
        {!projects.length ? (
          <Empty>No active projects.</Empty>
        ) : (
          <div className="stack">
            {projects.map((project) => (
              <article className="card project-expand-card" key={project.id}>
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
