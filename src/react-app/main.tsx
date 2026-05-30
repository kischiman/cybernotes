import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  Camera,
  Check,
  ClipboardList,
  Download,
  Eye,
  Home,
  LogOut,
  Plus,
  Trash2,
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
  status: "active" | "completed";
  created_at: string;
  updated_at: string;
  last_entry_at?: string | null;
  open_todo_count?: number;
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
  person_name?: string | null;
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

function localDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
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

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [protocolsByProject, setProtocolsByProject] = useState<Record<string, Protocol[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { projects: nextProjects } = await apiJson<{ projects: Project[] }>("/api/projects?status=active");
      const protocolPairs = await Promise.all(
        nextProjects.map(async (project) => {
          const { protocols } = await apiJson<{ protocols: Protocol[] }>(`/api/projects/${project.id}/protocols`);
          return [project.id, protocols] as const;
        }),
      );
      setProjects(nextProjects);
      setProtocolsByProject(Object.fromEntries(protocolPairs));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
      </div>
      {!projects.length ? (
        <Empty>No active projects.</Empty>
      ) : (
        <div className="stack">
          {projects.map((project) => (
            <article className="card" key={project.id}>
              <NavLink className="card-link" to={`/projects/${project.id}`}>
                <h2>{project.title}</h2>
                {project.goal ? <p>{project.goal}</p> : null}
                <p className="meta">Started {formatDate(project.started_at)}</p>
              </NavLink>
              <div className="protocol-list">
                {(protocolsByProject[project.id] || []).map((protocol) => (
                  <NavLink className="protocol-row" key={protocol.id} to={`/protocols/${protocol.id}`}>
                    <div>
                      <strong>{protocol.title}</strong>
                      <span>{formatDateTime(protocol.last_entry_at)}</span>
                    </div>
                    <small>{protocol.open_todo_count || 0} open</small>
                  </NavLink>
                ))}
                {!protocolsByProject[project.id]?.length ? <p className="muted">No protocols yet.</p> : null}
              </div>
            </article>
          ))}
        </div>
      )}
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
  return new Date().toISOString().slice(0, 10);
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
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const { protocol } = await apiJson<{ protocol: Protocol }>(`/api/projects/${projectId}/protocols`, {
        method: "POST",
        body: JSON.stringify({ title, goal, intervention, metrics }),
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
      body: JSON.stringify({ body: todoBody, due_date: todoDue, person_id: todoPerson }),
    });
    setTodoBody("");
    setTodoDue("");
    setTodoPerson("");
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
                {todo.due_date ? <small>due {todo.due_date}</small> : null}
                {todo.person_name ? <em>{todo.person_name}</em> : null}
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
            <select value={todoPerson} onChange={(event) => setTodoPerson(event.target.value)}>
              <option value="">None</option>
              {people.map((person) => (
                <option value={person.id} key={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
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
