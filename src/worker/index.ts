import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";

type User = {
  email: string;
};

type AppEnv = {
  Bindings: Env;
  Variables: {
    user: User;
  };
};

type JsonRecord = Record<string, unknown>;

type ProjectRow = {
  id: string;
  title: string;
  goal: string | null;
  status: "active" | "completed";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProtocolRow = {
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
};

type EntryRow = {
  id: string;
  protocol_id: string;
  body: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
};

type PhotoRow = {
  id: string;
  entry_id: string;
  r2_key: string;
  r2_url: string;
  caption: string | null;
  created_at: string;
};

type ProtocolCycleRow = {
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
};

type ProtocolCyclePhotoRow = {
  id: string;
  cycle_id: string;
  r2_key: string;
  r2_url: string;
  caption: string | null;
  created_at: string;
};

type TodoRow = {
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
  project_id?: string;
  project_title?: string;
  protocol_title?: string;
  person_role?: string | null;
  created_at: string;
  updated_at: string;
};

type TodoAssignee = {
  assignee_id: string;
  person_id: string;
  name: string;
  role: string | null;
};

type PersonRow = {
  id: string;
  project_id: string;
  directory_id: string | null;
  name: string;
  note: string | null;
  created_at: string;
};

type DirectoryPersonRow = {
  id: string;
  name: string;
  note: string | null;
  created_at: string;
  updated_at: string | null;
  projects?: string[];
};

type TodoAssigneeRow = {
  id: string;
  todo_id: string;
  person_id: string;
  role: string | null;
  created_at: string;
  name?: string;
};

type CheckinSession = "morning" | "evening";

type CheckinTemplateRow = {
  id: string;
  session: CheckinSession;
  question: string;
  position: number;
  created_at: string;
  archived_at: string | null;
};

type CheckinEntryRow = {
  id: string;
  date: string;
  session: CheckinSession;
  created_at: string;
  updated_at: string;
};

type CheckinAnswerRow = {
  id: string;
  entry_id: string;
  template_id: string;
  question_snapshot: string;
  answer: string | null;
  position: number;
};

type WinRow = {
  id: string;
  body: string;
  project_id: string | null;
  project_title?: string | null;
  created_at: string;
  updated_at: string;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const SESSION_COOKIE = "cybernotes_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

const app = new Hono<AppEnv>();
const api = new Hono<AppEnv>();

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(c: Context<AppEnv>) {
  try {
    const body = await c.req.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value.trim() || null : null;
}

function hasOwn(body: JsonRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizeTags(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return raw
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
}

function parseTags(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return normalizeTags(parsed);
  } catch {
    return [];
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function jsonError(c: Context<AppEnv>, status: 400 | 401 | 403 | 404 | 500, message: string) {
  return c.json({ error: message }, status);
}

function validateStatus(value: unknown) {
  return value === "active" || value === "completed" ? value : null;
}

function validateCheckinSession(value: unknown): CheckinSession | null {
  return value === "morning" || value === "evening" ? value : null;
}

function validateTodoPersonRole(value: unknown) {
  const role = nullableString(value)?.toUpperCase() ?? null;
  if (!role) return null;
  return ["R", "A", "S", "C", "I"].includes(role) ? role : undefined;
}

function validateTodoRecurrence(value: unknown) {
  if (value === null || value === undefined || value === "") return "one_off";
  return value === "one_off" || value === "recurring" ? value : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

type TodoRecurrenceFrequency = "daily" | "weekly" | "monthly";

function validateTodoRecurrenceDetails(
  recurrence: "one_off" | "recurring",
  rawFrequency: unknown,
  rawDay: unknown,
): { recurrence_frequency: TodoRecurrenceFrequency | null; recurrence_day: number | null } | null {
  if (recurrence === "one_off") {
    return { recurrence_frequency: null, recurrence_day: null };
  }
  const frequency: TodoRecurrenceFrequency = rawFrequency === "weekly" || rawFrequency === "monthly" || rawFrequency === "daily" ? rawFrequency : "daily";
  if (frequency === "daily") {
    return { recurrence_frequency: frequency, recurrence_day: null };
  }
  const day = numberValue(rawDay);
  if (frequency === "weekly" && day !== null && day >= 0 && day <= 6) {
    return { recurrence_frequency: frequency, recurrence_day: day };
  }
  if (frequency === "monthly" && day !== null && day >= 1 && day <= 31) {
    return { recurrence_frequency: frequency, recurrence_day: day };
  }
  return null;
}

function validateDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function first<T>(env: Env, sql: string, ...bindings: unknown[]) {
  return await env.DB.prepare(sql).bind(...bindings).first<T>();
}

async function all<T>(env: Env, sql: string, ...bindings: unknown[]) {
  const result = await env.DB.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

async function run(env: Env, sql: string, ...bindings: unknown[]) {
  return await env.DB.prepare(sql).bind(...bindings).run();
}

async function getSetting(env: Env, key: string) {
  const row = await first<{ value: string | null }>(env, "SELECT value FROM app_settings WHERE key = ?", key);
  return row?.value ?? null;
}

async function setSetting(env: Env, key: string, value: string | null) {
  await run(
    env,
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    key,
    value,
    nowIso(),
  );
}

async function withTodoAssignees<T extends TodoRow>(env: Env, todos: T[]) {
  if (!todos.length) return todos.map((todo) => ({ ...todo, assignees: [] as TodoAssignee[] }));
  const placeholders = todos.map(() => "?").join(", ");
  const rows = await all<TodoAssigneeRow & { name: string }>(
    env,
    `SELECT todo_assignees.id, todo_assignees.todo_id, todo_assignees.person_id, todo_assignees.role, todo_assignees.created_at,
      people_directory.name
     FROM todo_assignees
     JOIN people_directory ON people_directory.id = todo_assignees.person_id
     WHERE todo_assignees.todo_id IN (${placeholders})
     ORDER BY datetime(todo_assignees.created_at) ASC`,
    ...todos.map((todo) => todo.id),
  );
  const assigneesByTodo = rows.reduce<Record<string, TodoAssignee[]>>((map, row) => {
    map[row.todo_id] ||= [];
    map[row.todo_id].push({
      assignee_id: row.id,
      person_id: row.person_id,
      name: row.name,
      role: row.role,
    });
    return map;
  }, {});
  return todos.map((todo) => ({ ...todo, assignees: assigneesByTodo[todo.id] || [] }));
}

async function todoAssigneePayload(env: Env, id: string) {
  const row = await first<TodoAssigneeRow & { name: string }>(
    env,
    `SELECT todo_assignees.id, todo_assignees.todo_id, todo_assignees.person_id, todo_assignees.role, todo_assignees.created_at,
      people_directory.name
     FROM todo_assignees
     JOIN people_directory ON people_directory.id = todo_assignees.person_id
     WHERE todo_assignees.id = ?`,
    id,
  );
  return row
    ? {
        assignee_id: row.id,
        person_id: row.person_id,
        name: row.name,
        role: row.role,
      }
    : null;
}

function base64Url(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes.buffer);
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64Url(signature);
}

function devAuthEnabled(env: Env) {
  return env.DEV_AUTH_BYPASS === "true" || env.DEV_AUTH_BYPASS === "1";
}

function sessionSecret(env: Env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (devAuthEnabled(env)) return "cybernotes-local-dev-session-secret";
  return null;
}

async function createSession(c: Context<AppEnv>, email: string) {
  const secret = sessionSecret(c.env);
  if (!secret) throw new Error("SESSION_SECRET is required");

  const token = randomToken();
  const signature = await hmac(secret, token);
  await c.env.SESSIONS.put(
    `session:${token}`,
    JSON.stringify({ email, created_at: nowIso() }),
    { expirationTtl: SESSION_TTL_SECONDS },
  );

  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, `${token}.${signature}`, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

async function authenticate(c: Context<AppEnv>) {
  if (devAuthEnabled(c.env)) {
    return { email: c.env.ALLOWED_EMAIL || "dev@cybernotes.local" };
  }

  const secret = sessionSecret(c.env);
  const cookie = getCookie(c, SESSION_COOKIE);
  if (!secret || !cookie) return null;

  const [token, signature] = cookie.split(".");
  if (!token || !signature) return null;

  const expected = await hmac(secret, token);
  if (signature !== expected) return null;

  const session = await c.env.SESSIONS.get(`session:${token}`, "json");
  if (!isRecord(session) || typeof session.email !== "string") return null;
  return { email: session.email };
}

async function deleteSession(c: Context<AppEnv>) {
  const cookie = getCookie(c, SESSION_COOKIE);
  const token = cookie?.split(".")[0];
  if (token) await c.env.SESSIONS.delete(`session:${token}`);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await authenticate(c);
  if (!user) return jsonError(c, 401, "Unauthenticated");
  c.set("user", user);
  return next();
};

function authProblem(message: string, status = 400) {
  return new Response(
    `<!doctype html><html><head><title>Cybernotes</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="font-family: Inter, system-ui, sans-serif; margin: 32px; color: #000;"><h1>Cybernotes</h1><p>${message}</p><p><a href="/">Return home</a></p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

app.get("/auth/login", async (c) => {
  if (devAuthEnabled(c.env)) {
    await createSession(c, c.env.ALLOWED_EMAIL || "dev@cybernotes.local");
    return c.redirect("/");
  }

  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET || !c.env.ALLOWED_EMAIL) {
    return authProblem("Google OAuth is not configured yet. Fill .dev.vars locally or Worker secrets in production.", 500);
  }

  const state = randomToken();
  await c.env.SESSIONS.put(`oauth_state:${state}`, "1", { expirationTtl: 600 });

  const redirectUri = new URL("/auth/callback", c.req.url).toString();
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return authProblem("OAuth callback was missing a code or state.", 400);

  const savedState = await c.env.SESSIONS.get(`oauth_state:${state}`);
  if (!savedState) return authProblem("OAuth state expired. Please sign in again.", 400);
  await c.env.SESSIONS.delete(`oauth_state:${state}`);

  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET || !c.env.ALLOWED_EMAIL) {
    return authProblem("Google OAuth is not configured yet.", 500);
  }

  const redirectUri = new URL("/auth/callback", c.req.url).toString();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) return authProblem("Google rejected the OAuth code.", 401);
  const tokenJson = await tokenResponse.json<{ access_token?: string }>();
  if (!tokenJson.access_token) return authProblem("Google did not return an access token.", 401);

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userResponse.ok) return authProblem("Could not fetch your Google profile.", 401);

  const googleUser = await userResponse.json<{ email?: string; email_verified?: boolean }>();
  const email = googleUser.email?.toLowerCase();
  if (!email || email !== c.env.ALLOWED_EMAIL.toLowerCase()) {
    return authProblem("Unauthorised Google account for this Cybernotes instance.", 403);
  }

  await createSession(c, email);
  return c.redirect("/");
});

app.get("/auth/logout", async (c) => {
  await deleteSession(c);
  return c.redirect("/");
});

api.get("/health", (c) => c.json({ ok: true }));
api.use("*", requireSession);
api.get("/me", (c) => c.json({ user: c.get("user") }));

api.get("/profile", async (c) => {
  const name = await getSetting(c.env, "profile_name");
  return c.json({ email: c.get("user").email, name: name ?? "" });
});

api.put("/profile", async (c) => {
  const body = await readJson(c);
  const name = cleanString(body.name) ?? "";
  await setSetting(c.env, "profile_name", name || null);
  return c.json({ email: c.get("user").email, name });
});

api.post("/transcribe", async (c) => {
  if (!c.env.GEMINI_API_KEY) return jsonError(c, 500, "Transcription failed");

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return jsonError(c, 400, "No image provided");
  }
  const image = form.get("image");
  if (!(image instanceof File)) return jsonError(c, 400, "No image provided");
  if (image.size > 4 * 1024 * 1024) return jsonError(c, 400, "Image too large");
  if (!["image/jpeg", "image/png"].includes(image.type)) return jsonError(c, 400, "Image must be JPEG or PNG");

  const base64 = bytesToBase64(new Uint8Array(await image.arrayBuffer()));
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(c.env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: image.type,
                  data: base64,
                },
              },
              {
                text: "Transcribe all handwritten text in this image exactly as written. Return only the transcribed text with no commentary, formatting, or explanation. Preserve line breaks where they appear in the original.",
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );

  if (!response.ok) return jsonError(c, 500, "Transcription failed");

  const data = await response.json<GeminiGenerateContentResponse>();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  return c.json({ text });
});

// Transcribe a short voice memo. The client records audio, encodes it to WAV,
// and posts it here; we forward to Gemini and return plain text. Audio is never
// persisted — transcribe-and-discard, mirroring the handwriting flow above.
api.post("/transcribe-audio", async (c) => {
  if (!c.env.GEMINI_API_KEY) return jsonError(c, 500, "Transcription failed");

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return jsonError(c, 400, "No audio provided");
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) return jsonError(c, 400, "No audio provided");
  if (audio.size > 25 * 1024 * 1024) return jsonError(c, 400, "Recording too long");
  const mime = audio.type || "audio/wav";
  const allowed = ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm", "audio/flac"];
  if (!allowed.includes(mime)) return jsonError(c, 400, "Unsupported audio format");

  const base64 = bytesToBase64(new Uint8Array(await audio.arrayBuffer()));
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(c.env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mime, data: base64 } },
              {
                text: "Transcribe this voice memo verbatim into clean text. Return only the transcript with no commentary, labels, or timestamps. Use natural sentence punctuation and paragraph breaks. If there is no discernible speech, return an empty string.",
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );

  if (!response.ok) return jsonError(c, 500, "Transcription failed");

  const data = await response.json<GeminiGenerateContentResponse>();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  return c.json({ text });
});

api.get("/vision", async (c) => {
  const vision = await first<{ id: string; body: string | null; updated_at: string | null }>(
    c.env,
    "SELECT id, body, updated_at FROM visions LIMIT 1",
  );
  return c.json(vision ?? { id: "vision", body: "", updated_at: null });
});

api.put("/vision", async (c) => {
  const body = await readJson(c);
  const visionBody = nullableString(body.body);
  const updatedAt = nowIso();
  const existing = await first<{ id: string }>(c.env, "SELECT id FROM visions LIMIT 1");

  if (existing) {
    await run(c.env, "UPDATE visions SET body = ?, updated_at = ? WHERE id = ?", visionBody, updatedAt, existing.id);
    return c.json({ id: existing.id, body: visionBody, updated_at: updatedAt });
  }

  await run(c.env, "INSERT INTO visions (id, body, updated_at) VALUES (?, ?, ?)", "vision", visionBody, updatedAt);
  return c.json({ id: "vision", body: visionBody, updated_at: updatedAt }, 201);
});

api.get("/projects", async (c) => {
  const status = c.req.query("status") || "active";
  if (!["active", "completed", "all"].includes(status)) return jsonError(c, 400, "Invalid project status");

  const projects =
    status === "all"
      ? await all<ProjectRow>(c.env, "SELECT * FROM projects ORDER BY datetime(created_at) DESC")
      : await all<ProjectRow>(c.env, "SELECT * FROM projects WHERE status = ? ORDER BY datetime(created_at) DESC", status);

  return c.json({ projects });
});

api.post("/projects", async (c) => {
  const body = await readJson(c);
  const title = cleanString(body.title);
  if (!title) return jsonError(c, 400, "Project title is required");

  const timestamp = nowIso();
  const project: ProjectRow = {
    id: crypto.randomUUID(),
    title,
    goal: nullableString(body.goal),
    status: "active",
    started_at: nullableString(body.started_at) || todayDate(),
    ended_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await run(
    c.env,
    "INSERT INTO projects (id, title, goal, status, started_at, ended_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    project.id,
    project.title,
    project.goal,
    project.status,
    project.started_at,
    project.ended_at,
    project.created_at,
    project.updated_at,
  );
  return c.json({ project }, 201);
});

api.get("/projects/:id", async (c) => {
  const project = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", c.req.param("id"));
  if (!project) return jsonError(c, 404, "Project not found");
  return c.json({ project });
});

api.patch("/projects/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Project not found");

  const body = await readJson(c);
  const sets: string[] = [];
  const values: unknown[] = [];

  if (hasOwn(body, "title")) {
    const title = cleanString(body.title);
    if (!title) return jsonError(c, 400, "Project title cannot be empty");
    sets.push("title = ?");
    values.push(title);
  }
  if (hasOwn(body, "goal")) {
    sets.push("goal = ?");
    values.push(nullableString(body.goal));
  }
  if (hasOwn(body, "started_at")) {
    sets.push("started_at = ?");
    values.push(nullableString(body.started_at));
  }
  if (hasOwn(body, "ended_at")) {
    sets.push("ended_at = ?");
    values.push(nullableString(body.ended_at));
  }
  if (hasOwn(body, "status")) {
    const status = validateStatus(body.status);
    if (!status) return jsonError(c, 400, "Invalid project status");
    sets.push("status = ?");
    values.push(status);
    if (status === "completed" && !hasOwn(body, "ended_at")) {
      sets.push("ended_at = ?");
      values.push(nowIso());
    }
  }

  if (!sets.length) return c.json({ project: existing });
  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  await run(c.env, `UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, ...values);

  const project = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", id);
  return c.json({ project });
});

async function deletePhotosByRows(env: Env, photos: Array<{ r2_key: string }>) {
  await Promise.allSettled(photos.map((photo) => env.PHOTOS.delete(photo.r2_key)));
}

api.delete("/projects/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Project not found");

  const photos = await all<PhotoRow>(
    c.env,
    "SELECT photos.* FROM photos JOIN entries ON photos.entry_id = entries.id JOIN protocols ON entries.protocol_id = protocols.id WHERE protocols.project_id = ?",
    id,
  );
  const cyclePhotos = await all<ProtocolCyclePhotoRow>(
    c.env,
    "SELECT protocol_cycle_photos.* FROM protocol_cycle_photos JOIN protocol_cycles ON protocol_cycle_photos.cycle_id = protocol_cycles.id WHERE protocol_cycles.project_id = ?",
    id,
  );
  await deletePhotosByRows(c.env, photos);
  await deletePhotosByRows(c.env, cyclePhotos);
  await run(c.env, "DELETE FROM projects WHERE id = ?", id);
  return c.json({ ok: true });
});

function cyclePhotoPayload(photo: ProtocolCyclePhotoRow) {
  return photo;
}

function cyclePayload(cycle: ProtocolCycleRow, photos: ProtocolCyclePhotoRow[] = []) {
  return {
    ...cycle,
    photos: photos.map(cyclePhotoPayload),
  };
}

api.get("/projects/:id/cycles", async (c) => {
  const projectId = c.req.param("id");
  const project = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", projectId);
  if (!project) return jsonError(c, 404, "Project not found");

  const cycles = await all<ProtocolCycleRow>(
    c.env,
    "SELECT * FROM protocol_cycles WHERE project_id = ? ORDER BY datetime(completed_at) DESC, datetime(created_at) DESC",
    projectId,
  );
  const photos = await all<ProtocolCyclePhotoRow>(
    c.env,
    `SELECT protocol_cycle_photos.*
     FROM protocol_cycle_photos
     JOIN protocol_cycles ON protocol_cycle_photos.cycle_id = protocol_cycles.id
     WHERE protocol_cycles.project_id = ?
     ORDER BY datetime(protocol_cycle_photos.created_at) ASC`,
    projectId,
  );

  return c.json({
    cycles: cycles.map((cycle) => cyclePayload(cycle, photos.filter((photo) => photo.cycle_id === cycle.id))),
  });
});

api.get("/projects/:id/protocols", async (c) => {
  const projectId = c.req.param("id");
  const project = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", projectId);
  if (!project) return jsonError(c, 404, "Project not found");

  const protocols = await all<ProtocolRow & { last_entry_at: string | null; open_todo_count: number }>(
    c.env,
    `SELECT protocols.*,
      (SELECT MAX(created_at) FROM entries WHERE entries.protocol_id = protocols.id) AS last_entry_at,
      (SELECT COUNT(*) FROM todos WHERE todos.protocol_id = protocols.id AND done = 0) AS open_todo_count
     FROM protocols
     WHERE project_id = ?
     ORDER BY datetime(created_at) DESC`,
    projectId,
  );
  return c.json({ protocols });
});

api.post("/projects/:id/protocols", async (c) => {
  const projectId = c.req.param("id");
  const project = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", projectId);
  if (!project) return jsonError(c, 404, "Project not found");

  const body = await readJson(c);
  const title = cleanString(body.title);
  if (!title) return jsonError(c, 400, "Protocol title is required");
  const deadline = nullableString(body.deadline);
  if (!deadline) return jsonError(c, 400, "Protocol deadline is required");

  const timestamp = nowIso();
  const protocol: ProtocolRow = {
    id: crypto.randomUUID(),
    project_id: projectId,
    title,
    goal: nullableString(body.goal),
    intervention: nullableString(body.intervention),
    metrics: nullableString(body.metrics),
    deadline,
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
  };

  await run(
    c.env,
    "INSERT INTO protocols (id, project_id, title, goal, intervention, metrics, deadline, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    protocol.id,
    protocol.project_id,
    protocol.title,
    protocol.goal,
    protocol.intervention,
    protocol.metrics,
    protocol.deadline,
    protocol.status,
    protocol.created_at,
    protocol.updated_at,
  );
  return c.json({ protocol }, 201);
});

api.get("/protocols/active", async (c) => {
  const protocols = await all<ProtocolRow & { project_title: string; project_started_at: string | null }>(
    c.env,
    `SELECT protocols.*, projects.title AS project_title, projects.started_at AS project_started_at
     FROM protocols
     JOIN projects ON projects.id = protocols.project_id
     WHERE protocols.status = 'active'
       AND projects.status = 'active'
       AND protocols.deadline IS NOT NULL
     ORDER BY projects.title COLLATE NOCASE ASC, datetime(protocols.created_at) ASC`,
  );
  return c.json({ protocols });
});

api.get("/protocols/:id", async (c) => {
  const protocol = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", c.req.param("id"));
  if (!protocol) return jsonError(c, 404, "Protocol not found");
  return c.json({ protocol });
});

api.patch("/protocols/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Protocol not found");

  const body = await readJson(c);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (hasOwn(body, "title")) {
    const title = cleanString(body.title);
    if (!title) return jsonError(c, 400, "Protocol title cannot be empty");
    sets.push("title = ?");
    values.push(title);
  }
  for (const field of ["goal", "intervention", "metrics", "deadline"] as const) {
    if (hasOwn(body, field)) {
      if (field === "deadline" && !nullableString(body[field])) {
        return jsonError(c, 400, "Protocol deadline is required");
      }
      sets.push(`${field} = ?`);
      values.push(nullableString(body[field]));
    }
  }
  if (hasOwn(body, "status")) {
    const status = validateStatus(body.status);
    if (!status) return jsonError(c, 400, "Invalid protocol status");
    sets.push("status = ?");
    values.push(status);
  }

  if (!sets.length) return c.json({ protocol: existing });
  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  await run(c.env, `UPDATE protocols SET ${sets.join(", ")} WHERE id = ?`, ...values);

  const protocol = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", id);
  return c.json({ protocol });
});

api.delete("/protocols/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Protocol not found");

  const photos = await all<PhotoRow>(
    c.env,
    "SELECT photos.* FROM photos JOIN entries ON photos.entry_id = entries.id WHERE entries.protocol_id = ?",
    id,
  );
  await deletePhotosByRows(c.env, photos);
  await run(c.env, "DELETE FROM protocols WHERE id = ?", id);
  return c.json({ ok: true });
});

async function entriesWithPhotos(env: Env, protocolId: string) {
  const entries = await all<EntryRow>(
    env,
    "SELECT * FROM entries WHERE protocol_id = ? ORDER BY datetime(created_at) DESC",
    protocolId,
  );
  const photos = await all<PhotoRow>(
    env,
    "SELECT photos.* FROM photos JOIN entries ON photos.entry_id = entries.id WHERE entries.protocol_id = ? ORDER BY datetime(photos.created_at)",
    protocolId,
  );

  return entries.map((entry) => ({
    ...entry,
    tags: parseTags(entry.tags),
    photos: photos.filter((photo) => photo.entry_id === entry.id),
  }));
}

api.get("/protocols/:id/entries", async (c) => {
  const protocolId = c.req.param("id");
  const protocol = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", protocolId);
  if (!protocol) return jsonError(c, 404, "Protocol not found");
  return c.json({ entries: await entriesWithPhotos(c.env, protocolId) });
});

api.post("/protocols/:id/cycle-draft", async (c) => {
  const protocolId = c.req.param("id");
  const protocol = await first<ProtocolRow & { project_title: string; project_goal: string | null }>(
    c.env,
    `SELECT protocols.*, projects.title AS project_title, projects.goal AS project_goal
     FROM protocols
     JOIN projects ON projects.id = protocols.project_id
     WHERE protocols.id = ?`,
    protocolId,
  );
  if (!protocol) return jsonError(c, 404, "Protocol not found");
  if (!c.env.GEMINI_API_KEY) return jsonError(c, 500, "GEMINI_API_KEY is not configured");

  const entries = (await entriesWithPhotos(c.env, protocolId)).slice().reverse();
  const todos = await all<TodoRow>(
    c.env,
    "SELECT * FROM todos WHERE protocol_id = ? ORDER BY done ASC, position ASC, datetime(created_at) ASC",
    protocolId,
  );
  const entryNotes = entries.length
    ? entries
        .map((entry, index) => {
          const tags = Array.isArray(entry.tags) && entry.tags.length ? `\nTags: ${entry.tags.join(", ")}` : "";
          const photos = entry.photos.length ? `\nPhotos attached: ${entry.photos.length}` : "";
          return `Entry ${index + 1} — ${entry.created_at}\n${entry.body || "(empty)"}${tags}${photos}`;
        })
        .join("\n\n---\n\n")
    : "No entries were captured in this protocol cycle.";
  const todoNotes = todos.length
    ? todos.map((todo) => `- [${todo.done ? "x" : " "}] ${todo.body}${todo.due_date ? ` (due ${todo.due_date})` : ""}`).join("\n")
    : "No to-dos were attached to this protocol.";
  const system =
    "You synthesize an N=1 experiment protocol cycle. Write concise, useful Markdown. " +
    "Use only the provided project, protocol, notes, and to-do context. Avoid inventing facts. " +
    "Name patterns, tensions, evidence quality, concrete results, and next-cycle design implications.";
  const user = [
    `Project: ${protocol.project_title}`,
    protocol.project_goal ? `Project goal: ${protocol.project_goal}` : "",
    `Protocol: ${protocol.title}`,
    protocol.goal ? `Protocol goal: ${protocol.goal}` : "",
    protocol.intervention ? `Intervention: ${protocol.intervention}` : "",
    protocol.metrics ? `Metrics: ${protocol.metrics}` : "",
    protocol.deadline ? `Deadline: ${protocol.deadline}` : "",
    `\nEntries:\n${entryNotes}`,
    `\nTo-dos:\n${todoNotes}`,
    "\nReturn Markdown with these headings: Synthesis, Patterns, Results, Evidence Gaps, Next Phase.",
  ].filter(Boolean).join("\n\n");

  try {
    const { text } = await geminiCompose(c.env, system, user, false);
    return c.json({ synthesis: text.trim() });
  } catch (error) {
    return jsonError(c, 500, error instanceof Error ? error.message : "Could not synthesize cycle");
  }
});

api.post("/protocols/:id/cycles", async (c) => {
  const protocolId = c.req.param("id");
  const protocol = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", protocolId);
  if (!protocol) return jsonError(c, 404, "Protocol not found");

  const body = await readJson(c);
  const synthesis = nullableString(body.synthesis);
  const notes = nullableString(body.notes);
  const results = nullableString(body.results);
  if (!synthesis && !notes && !results) return jsonError(c, 400, "Add synthesis, notes, or results before saving");

  const timestamp = nowIso();
  const cycle: ProtocolCycleRow = {
    id: crypto.randomUUID(),
    project_id: protocol.project_id,
    protocol_id: protocol.id,
    protocol_title: protocol.title,
    synthesis,
    notes,
    results,
    completed_at: nullableString(body.completed_at) || timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await run(
    c.env,
    `INSERT INTO protocol_cycles
      (id, project_id, protocol_id, protocol_title, synthesis, notes, results, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cycle.id,
    cycle.project_id,
    cycle.protocol_id,
    cycle.protocol_title,
    cycle.synthesis,
    cycle.notes,
    cycle.results,
    cycle.completed_at,
    cycle.created_at,
    cycle.updated_at,
  );
  await run(c.env, "UPDATE protocols SET status = 'completed', updated_at = ? WHERE id = ?", timestamp, protocol.id);

  return c.json({ cycle: cyclePayload(cycle) }, 201);
});

api.post("/protocols/:id/entries", async (c) => {
  const protocolId = c.req.param("id");
  const protocol = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", protocolId);
  if (!protocol) return jsonError(c, 404, "Protocol not found");

  const body = await readJson(c);
  const timestamp = nowIso();
  const entry: EntryRow = {
    id: crypto.randomUUID(),
    protocol_id: protocolId,
    body: nullableString(body.body),
    tags: JSON.stringify(normalizeTags(body.tags)),
    created_at: nullableString(body.created_at) || timestamp,
    updated_at: timestamp,
  };

  await run(
    c.env,
    "INSERT INTO entries (id, protocol_id, body, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    entry.id,
    entry.protocol_id,
    entry.body,
    entry.tags,
    entry.created_at,
    entry.updated_at,
  );
  return c.json({ entry: { ...entry, tags: parseTags(entry.tags), photos: [] } }, 201);
});

api.patch("/entries/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<EntryRow>(c.env, "SELECT * FROM entries WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Entry not found");

  const body = await readJson(c);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (hasOwn(body, "body")) {
    sets.push("body = ?");
    values.push(nullableString(body.body));
  }
  if (hasOwn(body, "tags")) {
    sets.push("tags = ?");
    values.push(JSON.stringify(normalizeTags(body.tags)));
  }
  if (hasOwn(body, "created_at")) {
    sets.push("created_at = ?");
    values.push(nullableString(body.created_at) || existing.created_at);
  }

  if (!sets.length) return c.json({ entry: { ...existing, tags: parseTags(existing.tags) } });
  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  await run(c.env, `UPDATE entries SET ${sets.join(", ")} WHERE id = ?`, ...values);

  const entry = await first<EntryRow>(c.env, "SELECT * FROM entries WHERE id = ?", id);
  const photos = await all<PhotoRow>(c.env, "SELECT * FROM photos WHERE entry_id = ?", id);
  return c.json({ entry: entry ? { ...entry, tags: parseTags(entry.tags), photos } : null });
});

api.delete("/entries/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<EntryRow>(c.env, "SELECT * FROM entries WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Entry not found");

  const photos = await all<PhotoRow>(c.env, "SELECT * FROM photos WHERE entry_id = ?", id);
  await deletePhotosByRows(c.env, photos);
  await run(c.env, "DELETE FROM entries WHERE id = ?", id);
  return c.json({ ok: true });
});

function publicPhotoUrl(c: Context<AppEnv>, photoId: string, key: string) {
  const base = c.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}/${key}`;
  return new URL(`/api/photos/${photoId}/file`, c.req.url).toString();
}

function publicCyclePhotoUrl(c: Context<AppEnv>, photoId: string, key: string) {
  const base = c.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}/${key}`;
  return new URL(`/api/cycle-photos/${photoId}/file`, c.req.url).toString();
}

api.post("/entries/:id/photos", async (c) => {
  const entryId = c.req.param("id");
  const entry = await first<EntryRow>(c.env, "SELECT * FROM entries WHERE id = ?", entryId);
  if (!entry) return jsonError(c, 404, "Entry not found");

  const form = await c.req.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) return jsonError(c, 400, "Photo file is required");

  const caption = nullableString(form.get("caption"));
  const photoId = crypto.randomUUID();
  const extension = cleanString(file.name)?.split(".").pop();
  const safeExtension = extension && extension.length <= 8 ? `.${extension.replace(/[^a-zA-Z0-9]/g, "")}` : "";
  const key = `${entryId}/${photoId}${safeExtension}`;
  await c.env.PHOTOS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const photo: PhotoRow = {
    id: photoId,
    entry_id: entryId,
    r2_key: key,
    r2_url: publicPhotoUrl(c, photoId, key),
    caption,
    created_at: nowIso(),
  };
  await run(
    c.env,
    "INSERT INTO photos (id, entry_id, r2_key, r2_url, caption, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    photo.id,
    photo.entry_id,
    photo.r2_key,
    photo.r2_url,
    photo.caption,
    photo.created_at,
  );
  return c.json({ photo }, 201);
});

api.post("/protocol-cycles/:id/photos", async (c) => {
  const cycleId = c.req.param("id");
  const cycle = await first<ProtocolCycleRow>(c.env, "SELECT * FROM protocol_cycles WHERE id = ?", cycleId);
  if (!cycle) return jsonError(c, 404, "Cycle not found");

  const form = await c.req.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) return jsonError(c, 400, "Photo file is required");

  const caption = nullableString(form.get("caption"));
  const photoId = crypto.randomUUID();
  const extension = cleanString(file.name)?.split(".").pop();
  const safeExtension = extension && extension.length <= 8 ? `.${extension.replace(/[^a-zA-Z0-9]/g, "")}` : "";
  const key = `cycles/${cycleId}/${photoId}${safeExtension}`;
  await c.env.PHOTOS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const photo: ProtocolCyclePhotoRow = {
    id: photoId,
    cycle_id: cycleId,
    r2_key: key,
    r2_url: publicCyclePhotoUrl(c, photoId, key),
    caption,
    created_at: nowIso(),
  };
  await run(
    c.env,
    "INSERT INTO protocol_cycle_photos (id, cycle_id, r2_key, r2_url, caption, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    photo.id,
    photo.cycle_id,
    photo.r2_key,
    photo.r2_url,
    photo.caption,
    photo.created_at,
  );
  return c.json({ photo }, 201);
});

api.get("/photos/:id/file", async (c) => {
  const photo = await first<PhotoRow>(c.env, "SELECT * FROM photos WHERE id = ?", c.req.param("id"));
  if (!photo) return jsonError(c, 404, "Photo not found");
  const object = await c.env.PHOTOS.get(photo.r2_key);
  if (!object) return jsonError(c, 404, "Photo object not found");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

api.get("/cycle-photos/:id/file", async (c) => {
  const photo = await first<ProtocolCyclePhotoRow>(c.env, "SELECT * FROM protocol_cycle_photos WHERE id = ?", c.req.param("id"));
  if (!photo) return jsonError(c, 404, "Photo not found");
  const object = await c.env.PHOTOS.get(photo.r2_key);
  if (!object) return jsonError(c, 404, "Photo object not found");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

api.delete("/photos/:id", async (c) => {
  const photo = await first<PhotoRow>(c.env, "SELECT * FROM photos WHERE id = ?", c.req.param("id"));
  if (!photo) return jsonError(c, 404, "Photo not found");
  await c.env.PHOTOS.delete(photo.r2_key);
  await run(c.env, "DELETE FROM photos WHERE id = ?", photo.id);
  return c.json({ ok: true });
});

api.get("/todos", async (c) => {
  const today = c.req.query("date") || todayDate();
  const openTodos = await all<TodoRow>(
    c.env,
    `SELECT todos.*,
      protocols.title AS protocol_title,
      protocols.project_id AS project_id,
      projects.title AS project_title
     FROM todos
     JOIN protocols ON protocols.id = todos.protocol_id
     JOIN projects ON projects.id = protocols.project_id
     WHERE todos.done = 0 AND projects.status = 'active'
     ORDER BY COALESCE(todos.position, todos.rowid) ASC, datetime(todos.created_at) ASC`,
  );
  const completedToday = await all<TodoRow>(
    c.env,
    `SELECT todos.*,
      protocols.title AS protocol_title,
      protocols.project_id AS project_id,
      projects.title AS project_title
     FROM todos
     JOIN protocols ON protocols.id = todos.protocol_id
     JOIN projects ON projects.id = protocols.project_id
     WHERE todos.done = 1 AND projects.status = 'active' AND substr(todos.updated_at, 1, 10) = ?
     ORDER BY datetime(todos.updated_at) DESC`,
    today,
  );
  return c.json({
    todos: await withTodoAssignees(c.env, openTodos),
    completed_today: await withTodoAssignees(c.env, completedToday),
  });
});

api.get("/protocols/:id/todos", async (c) => {
  const protocolId = c.req.param("id");
  const protocol = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", protocolId);
  if (!protocol) return jsonError(c, 404, "Protocol not found");

  const todos = await all<TodoRow>(
    c.env,
    `SELECT todos.*
     FROM todos
     WHERE todos.protocol_id = ?
     ORDER BY todos.done ASC, COALESCE(todos.position, todos.rowid) ASC, COALESCE(todos.due_date, '') ASC, datetime(todos.created_at) DESC`,
    protocolId,
  );
  return c.json({ todos: await withTodoAssignees(c.env, todos) });
});

async function protocolProject(env: Env, protocolId: string) {
  return await first<ProtocolRow & { project_id: string }>(
    env,
    "SELECT protocols.* FROM protocols WHERE protocols.id = ?",
    protocolId,
  );
}

async function createDirectoryPerson(env: Env, rawName: unknown, rawNote: unknown = null) {
  const name = cleanString(rawName);
  if (!name) return null;

  const timestamp = nowIso();
  const person: DirectoryPersonRow = {
    id: crypto.randomUUID(),
    name,
    note: nullableString(rawNote),
    created_at: timestamp,
    updated_at: timestamp,
  };
  await run(
    env,
    "INSERT INTO people_directory (id, name, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    person.id,
    person.name,
    person.note,
    person.created_at,
    person.updated_at,
  );
  return person;
}

async function findOrCreateDirectoryPerson(env: Env, rawName: unknown, rawNote: unknown = null) {
  const name = cleanString(rawName);
  if (!name) return null;

  const existing = await first<DirectoryPersonRow>(
    env,
    "SELECT * FROM people_directory WHERE name = ? COLLATE NOCASE ORDER BY datetime(created_at) ASC LIMIT 1",
    name,
  );
  if (existing) return existing.id;

  const person = await createDirectoryPerson(env, name, rawNote);
  if (!person) return null;
  return person.id;
}

async function ensureProjectPersonForDirectory(env: Env, projectId: string, directoryId: string) {
  const directoryPerson = await first<DirectoryPersonRow>(env, "SELECT * FROM people_directory WHERE id = ?", directoryId);
  if (!directoryPerson) return null;

  const existing = await first<PersonRow>(env, "SELECT * FROM people WHERE project_id = ? AND directory_id = ?", projectId, directoryId);
  if (existing) return existing;

  const person: PersonRow = {
    id: crypto.randomUUID(),
    project_id: projectId,
    directory_id: directoryId,
    name: directoryPerson.name,
    note: directoryPerson.note,
    created_at: nowIso(),
  };
  await run(
    env,
    "INSERT INTO people (id, project_id, directory_id, name, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    person.id,
    person.project_id,
    person.directory_id,
    person.name,
    person.note,
    person.created_at,
  );
  return person;
}

async function resolveDirectoryPersonId(env: Env, protocolId: string, value: unknown) {
  const id = nullableString(value);
  if (!id) return null;
  const directoryPerson = await first<DirectoryPersonRow>(env, "SELECT * FROM people_directory WHERE id = ?", id);
  if (directoryPerson) return directoryPerson.id;

  const protocol = await protocolProject(env, protocolId);
  if (!protocol) return undefined;
  const projectPerson = await first<PersonRow>(env, "SELECT * FROM people WHERE id = ? AND project_id = ?", id, protocol.project_id);
  if (!projectPerson) return null;
  if (projectPerson.directory_id) return projectPerson.directory_id;

  const createdDirectoryPerson = await createDirectoryPerson(env, projectPerson.name, projectPerson.note);
  if (!createdDirectoryPerson) return null;
  await run(env, "UPDATE people SET directory_id = ? WHERE id = ?", createdDirectoryPerson.id, projectPerson.id);
  return createdDirectoryPerson.id;
}

async function resolveTodoAssigneeInputs(env: Env, protocolId: string, body: JsonRecord) {
  const protocol = await protocolProject(env, protocolId);
  if (!protocol) return undefined;

  const rawAssignees = Array.isArray(body.assignees) ? body.assignees : null;
  const inputs = rawAssignees?.length
    ? rawAssignees
    : hasOwn(body, "person_name") || hasOwn(body, "person_id")
      ? [{ person_id: body.person_id, name: body.person_name, role: body.person_role }]
      : [];

  const assignees: Array<{ person_id: string; role: string | null }> = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    if (!isRecord(input)) continue;
    let personId = await resolveDirectoryPersonId(env, protocolId, input.person_id);
    if (personId === undefined) return undefined;
    if (!personId && hasOwn(input, "name")) {
      personId = await findOrCreateDirectoryPerson(env, input.name);
    }
    if (!personId) continue;
    const role = validateTodoPersonRole(input.role);
    if (role === undefined) throw new Error("Invalid RASCI role");
    if (seen.has(personId)) continue;
    seen.add(personId);
    await ensureProjectPersonForDirectory(env, protocol.project_id, personId);
    assignees.push({ person_id: personId, role });
  }
  return assignees;
}

async function addTodoAssignees(env: Env, todoId: string, assignees: Array<{ person_id: string; role: string | null }>) {
  const timestamp = nowIso();
  for (const assignee of assignees) {
    await run(
      env,
      "INSERT INTO todo_assignees (id, todo_id, person_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      todoId,
      assignee.person_id,
      assignee.role,
      timestamp,
    );
  }
}

api.post("/protocols/:id/todos", async (c) => {
  const protocolId = c.req.param("id");
  const protocol = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", protocolId);
  if (!protocol) return jsonError(c, 404, "Protocol not found");

  const body = await readJson(c);
  const todoBody = cleanString(body.body);
  if (!todoBody) return jsonError(c, 400, "To-do body is required");

  let assignees: Array<{ person_id: string; role: string | null }>;
  try {
    const resolvedAssignees = await resolveTodoAssigneeInputs(c.env, protocolId, body);
    if (resolvedAssignees === undefined) return jsonError(c, 404, "Protocol not found");
    assignees = resolvedAssignees;
  } catch (error) {
    return jsonError(c, 400, error instanceof Error ? error.message : "Invalid assignee");
  }
  const recurrence = validateTodoRecurrence(body.recurrence);
  if (!recurrence) return jsonError(c, 400, "Invalid to-do recurrence");
  const recurrenceDetails = validateTodoRecurrenceDetails(recurrence, body.recurrence_frequency, body.recurrence_day);
  if (!recurrenceDetails) return jsonError(c, 400, "Invalid to-do recurrence details");

  const timestamp = nowIso();
  const maxPosition = await first<{ position: number | null }>(c.env, "SELECT MAX(position) AS position FROM todos");
  const todo: TodoRow = {
    id: crypto.randomUUID(),
    protocol_id: protocolId,
    body: todoBody,
    done: body.done === true || body.done === 1 ? 1 : 0,
    due_date: nullableString(body.due_date),
    recurrence,
    recurrence_frequency: recurrenceDetails.recurrence_frequency,
    recurrence_day: recurrenceDetails.recurrence_day,
    person_id: null,
    person_role: null,
    position: (maxPosition?.position || 0) + 1,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await run(
    c.env,
    "INSERT INTO todos (id, protocol_id, body, done, due_date, recurrence, recurrence_frequency, recurrence_day, person_id, person_role, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    todo.id,
    todo.protocol_id,
    todo.body,
    todo.done,
    todo.due_date,
    todo.recurrence,
    todo.recurrence_frequency,
    todo.recurrence_day,
    todo.person_id,
    todo.person_role,
    todo.position,
    todo.created_at,
    todo.updated_at,
  );
  await addTodoAssignees(c.env, todo.id, assignees);
  const [createdTodo] = await withTodoAssignees(c.env, [todo]);
  return c.json({ todo: createdTodo }, 201);
});

api.patch("/todos/reorder", async (c) => {
  const body = await readJson(c);
  if (!Array.isArray(body.ids)) return jsonError(c, 400, "ids must be an array");
  const ids = body.ids.filter((id): id is string => typeof id === "string");
  for (const [index, id] of ids.entries()) {
    await run(c.env, "UPDATE todos SET position = ?, updated_at = ? WHERE id = ?", index + 1, nowIso(), id);
  }
  return c.json({ ok: true });
});

api.patch("/todos/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<TodoRow>(c.env, "SELECT * FROM todos WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "To-do not found");

  const body = await readJson(c);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (hasOwn(body, "body")) {
    const todoBody = cleanString(body.body);
    if (!todoBody) return jsonError(c, 400, "To-do body cannot be empty");
    sets.push("body = ?");
    values.push(todoBody);
  }
  if (hasOwn(body, "done")) {
    sets.push("done = ?");
    values.push(body.done === true || body.done === 1 ? 1 : 0);
  }
  if (hasOwn(body, "due_date")) {
    sets.push("due_date = ?");
    values.push(nullableString(body.due_date));
  }
  if (hasOwn(body, "recurrence")) {
    const recurrence = validateTodoRecurrence(body.recurrence);
    if (!recurrence) return jsonError(c, 400, "Invalid to-do recurrence");
    const recurrenceDetails = validateTodoRecurrenceDetails(recurrence, body.recurrence_frequency, body.recurrence_day);
    if (!recurrenceDetails) return jsonError(c, 400, "Invalid to-do recurrence details");
    sets.push("recurrence = ?");
    values.push(recurrence);
    sets.push("recurrence_frequency = ?");
    values.push(recurrenceDetails.recurrence_frequency);
    sets.push("recurrence_day = ?");
    values.push(recurrenceDetails.recurrence_day);
  } else if (hasOwn(body, "recurrence_frequency") || hasOwn(body, "recurrence_day")) {
    const recurrenceDetails = validateTodoRecurrenceDetails(existing.recurrence, body.recurrence_frequency ?? existing.recurrence_frequency, body.recurrence_day ?? existing.recurrence_day);
    if (!recurrenceDetails) return jsonError(c, 400, "Invalid to-do recurrence details");
    sets.push("recurrence_frequency = ?");
    values.push(recurrenceDetails.recurrence_frequency);
    sets.push("recurrence_day = ?");
    values.push(recurrenceDetails.recurrence_day);
  }
  if (sets.length) {
    sets.push("updated_at = ?");
    values.push(nowIso(), id);
    await run(c.env, `UPDATE todos SET ${sets.join(", ")} WHERE id = ?`, ...values);
  }

  const todo = await first<TodoRow>(c.env, "SELECT * FROM todos WHERE id = ?", id);
  if (!todo) return jsonError(c, 404, "To-do not found");
  const [todoWithAssignees] = await withTodoAssignees(c.env, [todo]);
  return c.json({ todo: todoWithAssignees });
});

api.get("/todos/:id/assignees", async (c) => {
  const id = c.req.param("id");
  const todo = await first<TodoRow>(c.env, "SELECT * FROM todos WHERE id = ?", id);
  if (!todo) return jsonError(c, 404, "To-do not found");
  const [todoWithAssignees] = await withTodoAssignees(c.env, [todo]);
  return c.json({ assignees: todoWithAssignees.assignees });
});

api.post("/todos/:id/assignees", async (c) => {
  const todoId = c.req.param("id");
  const todo = await first<TodoRow>(c.env, "SELECT * FROM todos WHERE id = ?", todoId);
  if (!todo) return jsonError(c, 404, "To-do not found");

  const body = await readJson(c);
  let personId = await resolveDirectoryPersonId(c.env, todo.protocol_id, body.person_id);
  if (personId === undefined) return jsonError(c, 404, "Protocol not found");
  if (!personId && hasOwn(body, "name")) {
    const person = await createDirectoryPerson(c.env, body.name);
    personId = person?.id || null;
  }
  if (!personId) return jsonError(c, 400, "Person is required");

  const role = validateTodoPersonRole(body.role);
  if (role === undefined) return jsonError(c, 400, "Invalid RASCI role");

  const protocol = await protocolProject(c.env, todo.protocol_id);
  if (!protocol) return jsonError(c, 404, "Protocol not found");
  await ensureProjectPersonForDirectory(c.env, protocol.project_id, personId);

  const existing = await first<TodoAssigneeRow>(
    c.env,
    "SELECT * FROM todo_assignees WHERE todo_id = ? AND person_id = ?",
    todoId,
    personId,
  );
  if (existing) {
    await run(c.env, "UPDATE todo_assignees SET role = ? WHERE id = ?", role, existing.id);
    const assignee = await todoAssigneePayload(c.env, existing.id);
    return c.json({ assignee });
  }

  const assigneeId = crypto.randomUUID();
  await run(
    c.env,
    "INSERT INTO todo_assignees (id, todo_id, person_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    assigneeId,
    todoId,
    personId,
    role,
    nowIso(),
  );
  const assignee = await todoAssigneePayload(c.env, assigneeId);
  return c.json({ assignee }, 201);
});

api.patch("/todo-assignees/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<TodoAssigneeRow>(c.env, "SELECT * FROM todo_assignees WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Assignee not found");

  const body = await readJson(c);
  const role = validateTodoPersonRole(body.role);
  if (role === undefined) return jsonError(c, 400, "Invalid RASCI role");
  await run(c.env, "UPDATE todo_assignees SET role = ? WHERE id = ?", role, id);
  const assignee = await todoAssigneePayload(c.env, id);
  return c.json({ assignee });
});

api.delete("/todo-assignees/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<TodoAssigneeRow>(c.env, "SELECT * FROM todo_assignees WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Assignee not found");
  await run(c.env, "DELETE FROM todo_assignees WHERE id = ?", id);
  return c.json({ ok: true });
});

api.delete("/todos/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<TodoRow>(c.env, "SELECT * FROM todos WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "To-do not found");
  await run(c.env, "DELETE FROM todos WHERE id = ?", id);
  return c.json({ ok: true });
});

api.get("/people", async (c) => {
  const people = await all<DirectoryPersonRow>(
    c.env,
    "SELECT * FROM people_directory ORDER BY name COLLATE NOCASE, datetime(created_at) ASC",
  );
  const projectRows = await all<{ person_id: string; project_title: string }>(
    c.env,
    `SELECT people.directory_id AS person_id, projects.title AS project_title
     FROM people
     JOIN projects ON projects.id = people.project_id
     WHERE people.directory_id IS NOT NULL
     ORDER BY projects.title COLLATE NOCASE`,
  );
  const projectsByPerson = projectRows.reduce<Record<string, string[]>>((map, row) => {
    map[row.person_id] ||= [];
    if (!map[row.person_id].includes(row.project_title)) map[row.person_id].push(row.project_title);
    return map;
  }, {});
  return c.json({
    people: people.map((person) => ({
      ...person,
      projects: projectsByPerson[person.id] || [],
    })),
  });
});

api.post("/people", async (c) => {
  const body = await readJson(c);
  const person = await createDirectoryPerson(c.env, body.name, body.note);
  if (!person) return jsonError(c, 400, "Person name is required");
  return c.json({ person: { ...person, projects: [] } }, 201);
});

api.patch("/people/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<DirectoryPersonRow>(c.env, "SELECT * FROM people_directory WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Person not found");

  const body = await readJson(c);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (hasOwn(body, "name")) {
    const name = cleanString(body.name);
    if (!name) return jsonError(c, 400, "Person name cannot be empty");
    sets.push("name = ?");
    values.push(name);
  }
  if (hasOwn(body, "note")) {
    sets.push("note = ?");
    values.push(nullableString(body.note));
  }
  if (!sets.length) {
    return c.json({ person: { ...existing, projects: [] } });
  }

  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  await run(c.env, `UPDATE people_directory SET ${sets.join(", ")} WHERE id = ?`, ...values);

  if (hasOwn(body, "name") || hasOwn(body, "note")) {
    const updated = await first<DirectoryPersonRow>(c.env, "SELECT * FROM people_directory WHERE id = ?", id);
    if (updated) {
      await run(c.env, "UPDATE people SET name = ?, note = ? WHERE directory_id = ?", updated.name, updated.note, id);
    }
  }

  const { people } = await (async () => {
    const person = await first<DirectoryPersonRow>(c.env, "SELECT * FROM people_directory WHERE id = ?", id);
    if (!person) return { people: [] as Array<DirectoryPersonRow & { projects: string[] }> };
    const projects = await all<{ title: string }>(
      c.env,
      `SELECT projects.title
       FROM people
       JOIN projects ON projects.id = people.project_id
       WHERE people.directory_id = ?
       ORDER BY projects.title COLLATE NOCASE`,
      id,
    );
    return { people: [{ ...person, projects: projects.map((project) => project.title) }] };
  })();
  return c.json({ person: people[0] });
});

api.delete("/people/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<DirectoryPersonRow>(c.env, "SELECT * FROM people_directory WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Person not found");
  await run(c.env, "DELETE FROM todo_assignees WHERE person_id = ?", id);
  await run(c.env, "DELETE FROM people WHERE directory_id = ?", id);
  await run(c.env, "DELETE FROM people_directory WHERE id = ?", id);
  return c.json({ ok: true });
});

api.get("/projects/:id/people", async (c) => {
  const projectId = c.req.param("id");
  const project = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", projectId);
  if (!project) return jsonError(c, 404, "Project not found");
  const people = await all<PersonRow>(c.env, "SELECT * FROM people WHERE project_id = ? ORDER BY name COLLATE NOCASE", projectId);
  return c.json({ people });
});

api.post("/projects/:id/people", async (c) => {
  const projectId = c.req.param("id");
  const project = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", projectId);
  if (!project) return jsonError(c, 404, "Project not found");

  const body = await readJson(c);
  const requestedDirectoryId = nullableString(body.directory_id);
  let directoryId = requestedDirectoryId;
  if (directoryId) {
    const directoryPerson = await first<DirectoryPersonRow>(c.env, "SELECT * FROM people_directory WHERE id = ?", directoryId);
    if (!directoryPerson) return jsonError(c, 400, "Directory person not found");
  } else {
    const directoryPerson = await createDirectoryPerson(c.env, body.name, body.note);
    if (!directoryPerson) return jsonError(c, 400, "Person name is required");
    directoryId = directoryPerson.id;
  }
  if (!directoryId) return jsonError(c, 400, "Person name is required");

  const person = await ensureProjectPersonForDirectory(c.env, projectId, directoryId);
  if (!person) return jsonError(c, 400, "Directory person not found");
  return c.json({ person }, 201);
});

api.patch("/projects/:projectId/people/:personId", async (c) => {
  const projectId = c.req.param("projectId");
  const id = c.req.param("personId");
  const existing = await first<PersonRow>(c.env, "SELECT * FROM people WHERE id = ? AND project_id = ?", id, projectId);
  if (!existing) return jsonError(c, 404, "Person not found");

  const body = await readJson(c);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (hasOwn(body, "name")) {
    const name = cleanString(body.name);
    if (!name) return jsonError(c, 400, "Person name cannot be empty");
    sets.push("name = ?");
    values.push(name);
  }
  if (hasOwn(body, "note")) {
    sets.push("note = ?");
    values.push(nullableString(body.note));
  }

  if (!sets.length) return c.json({ person: existing });
  values.push(id, projectId);
  await run(c.env, `UPDATE people SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`, ...values);

  const person = await first<PersonRow>(c.env, "SELECT * FROM people WHERE id = ? AND project_id = ?", id, projectId);
  if (person?.directory_id) {
    await run(c.env, "UPDATE people_directory SET name = ?, note = ?, updated_at = ? WHERE id = ?", person.name, person.note, nowIso(), person.directory_id);
    await run(c.env, "UPDATE people SET name = ?, note = ? WHERE directory_id = ?", person.name, person.note, person.directory_id);
  }
  return c.json({ person });
});

api.delete("/projects/:projectId/people/:personId", async (c) => {
  const projectId = c.req.param("projectId");
  const id = c.req.param("personId");
  const existing = await first<PersonRow>(c.env, "SELECT * FROM people WHERE id = ? AND project_id = ?", id, projectId);
  if (!existing) return jsonError(c, 404, "Person not found");
  if (existing.directory_id) {
    await run(
      c.env,
      `DELETE FROM todo_assignees
       WHERE person_id = ?
       AND todo_id IN (
         SELECT todos.id
         FROM todos
         JOIN protocols ON protocols.id = todos.protocol_id
         WHERE protocols.project_id = ?
       )`,
      existing.directory_id,
      projectId,
    );
  } else {
    await run(c.env, "UPDATE todos SET person_id = NULL, updated_at = ? WHERE person_id = ?", nowIso(), id);
  }
  await run(c.env, "DELETE FROM people WHERE id = ? AND project_id = ?", id, projectId);
  return c.json({ ok: true });
});

api.get("/wins", async (c) => {
  const wins = await all<WinRow>(
    c.env,
    `SELECT wins.*, projects.title AS project_title
     FROM wins
     LEFT JOIN projects ON projects.id = wins.project_id
     ORDER BY datetime(wins.created_at) DESC`,
  );
  return c.json({ wins });
});

async function validProjectId(env: Env, projectId: string | null) {
  if (!projectId) return true;
  const project = await first<ProjectRow>(env, "SELECT * FROM projects WHERE id = ?", projectId);
  return Boolean(project);
}

api.post("/wins", async (c) => {
  const body = await readJson(c);
  const winBody = cleanString(body.body);
  if (!winBody) return jsonError(c, 400, "Win body is required");
  const projectId = nullableString(body.project_id);
  if (!(await validProjectId(c.env, projectId))) return jsonError(c, 400, "Project not found");

  const timestamp = nowIso();
  const win: WinRow = {
    id: crypto.randomUUID(),
    body: winBody,
    project_id: projectId,
    created_at: timestamp,
    updated_at: timestamp,
  };
  await run(
    c.env,
    "INSERT INTO wins (id, body, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    win.id,
    win.body,
    win.project_id,
    win.created_at,
    win.updated_at,
  );
  return c.json({ win }, 201);
});

api.patch("/wins/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<WinRow>(c.env, "SELECT * FROM wins WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Win not found");

  const body = await readJson(c);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (hasOwn(body, "body")) {
    const winBody = cleanString(body.body);
    if (!winBody) return jsonError(c, 400, "Win body cannot be empty");
    sets.push("body = ?");
    values.push(winBody);
  }
  if (hasOwn(body, "project_id")) {
    const projectId = nullableString(body.project_id);
    if (!(await validProjectId(c.env, projectId))) return jsonError(c, 400, "Project not found");
    sets.push("project_id = ?");
    values.push(projectId);
  }

  if (!sets.length) return c.json({ win: existing });
  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  await run(c.env, `UPDATE wins SET ${sets.join(", ")} WHERE id = ?`, ...values);
  const win = await first<WinRow>(
    c.env,
    "SELECT wins.*, projects.title AS project_title FROM wins LEFT JOIN projects ON projects.id = wins.project_id WHERE wins.id = ?",
    id,
  );
  return c.json({ win });
});

api.delete("/wins/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<WinRow>(c.env, "SELECT * FROM wins WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Win not found");
  await run(c.env, "DELETE FROM wins WHERE id = ?", id);
  return c.json({ ok: true });
});

const DEFAULT_CHECKIN_QUESTIONS: Record<CheckinSession, string[]> = {
  morning: [
    "What is trying to surface in my mind today?",
    "If I repeated yesterday's actions for a year, where would I end up?",
    "What's the one thing preventing me from getting to my next level?",
    "Why am I not working on it right now?",
    "What gives me energy? What drains it?",
    "What would my future self tell me about my current situation?",
  ],
  evening: [
    "Gratitude",
    "Success",
    "Today I learned",
    "Self love",
    "Mental clarity",
    "Emotional stability",
    "Spiritual attunement",
    "Love and connection",
    "Shadow check-in",
    "Letters to god",
  ],
};

async function ensureCheckinTemplates(env: Env) {
  const existing = await first<{ count: number }>(env, "SELECT COUNT(*) AS count FROM checkin_templates");
  if ((existing?.count || 0) > 0) return;

  const createdAt = nowIso();
  for (const session of ["morning", "evening"] as const) {
    for (const [index, question] of DEFAULT_CHECKIN_QUESTIONS[session].entries()) {
      await run(
        env,
        "INSERT OR IGNORE INTO checkin_templates (id, session, question, position, created_at, archived_at) VALUES (?, ?, ?, ?, ?, NULL)",
        `default-${session}-${index + 1}`,
        session,
        question,
        index + 1,
        createdAt,
      );
    }
  }
}

function groupedCheckinTemplates(templates: CheckinTemplateRow[]) {
  return {
    morning: templates.filter((template) => template.session === "morning"),
    evening: templates.filter((template) => template.session === "evening"),
  };
}

async function checkinEntryPayload(env: Env, date: string, session: CheckinSession) {
  const entry = await first<CheckinEntryRow>(
    env,
    "SELECT * FROM checkin_entries WHERE date = ? AND session = ?",
    date,
    session,
  );
  if (!entry) return null;

  const answers = await all<CheckinAnswerRow>(
    env,
    "SELECT * FROM checkin_answers WHERE entry_id = ? ORDER BY position ASC",
    entry.id,
  );
  return { entry, answers };
}

api.get("/checkin/templates", async (c) => {
  await ensureCheckinTemplates(c.env);
  const templates = await all<CheckinTemplateRow>(
    c.env,
    "SELECT * FROM checkin_templates WHERE archived_at IS NULL ORDER BY session, position ASC",
  );
  return c.json({ templates: groupedCheckinTemplates(templates) });
});

api.post("/checkin/templates", async (c) => {
  await ensureCheckinTemplates(c.env);
  const body = await readJson(c);
  const session = validateCheckinSession(body.session);
  const question = cleanString(body.question);
  if (!session) return jsonError(c, 400, "Session must be morning or evening");
  if (!question) return jsonError(c, 400, "Question is required");

  const maxPosition = await first<{ position: number | null }>(
    c.env,
    "SELECT MAX(position) AS position FROM checkin_templates WHERE session = ? AND archived_at IS NULL",
    session,
  );
  const requestedPosition = typeof body.position === "number" && Number.isFinite(body.position) ? body.position : null;
  const template: CheckinTemplateRow = {
    id: crypto.randomUUID(),
    session,
    question,
    position: requestedPosition || (maxPosition?.position || 0) + 1,
    created_at: nowIso(),
    archived_at: null,
  };

  await run(
    c.env,
    "INSERT INTO checkin_templates (id, session, question, position, created_at, archived_at) VALUES (?, ?, ?, ?, ?, NULL)",
    template.id,
    template.session,
    template.question,
    template.position,
    template.created_at,
  );
  return c.json({ template }, 201);
});

api.patch("/checkin/templates/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<CheckinTemplateRow>(c.env, "SELECT * FROM checkin_templates WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Check-in question not found");

  const body = await readJson(c);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (hasOwn(body, "question")) {
    const question = cleanString(body.question);
    if (!question) return jsonError(c, 400, "Question cannot be empty");
    sets.push("question = ?");
    values.push(question);
  }
  if (hasOwn(body, "position")) {
    const position = Number(body.position);
    if (!Number.isInteger(position) || position < 1) return jsonError(c, 400, "Position must be a positive integer");
    sets.push("position = ?");
    values.push(position);
  }

  if (!sets.length) return c.json({ template: existing });
  values.push(id);
  await run(c.env, `UPDATE checkin_templates SET ${sets.join(", ")} WHERE id = ?`, ...values);
  const template = await first<CheckinTemplateRow>(c.env, "SELECT * FROM checkin_templates WHERE id = ?", id);
  return c.json({ template });
});

api.delete("/checkin/templates/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<CheckinTemplateRow>(c.env, "SELECT * FROM checkin_templates WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Check-in question not found");
  await run(c.env, "UPDATE checkin_templates SET archived_at = ? WHERE id = ?", nowIso(), id);
  return c.json({ ok: true });
});

api.get("/checkin/entries", async (c) => {
  const dates = await all<{ date: string; sessions: string }>(
    c.env,
    "SELECT date, GROUP_CONCAT(session) AS sessions FROM checkin_entries GROUP BY date ORDER BY date DESC LIMIT 90",
  );
  return c.json({ dates });
});

api.get("/checkin/entries/:date", async (c) => {
  await ensureCheckinTemplates(c.env);
  const date = c.req.param("date");
  if (!validateDateString(date)) return jsonError(c, 400, "Date must be YYYY-MM-DD");

  return c.json({
    date,
    entries: {
      morning: await checkinEntryPayload(c.env, date, "morning"),
      evening: await checkinEntryPayload(c.env, date, "evening"),
    },
  });
});

api.post("/checkin/entries", async (c) => {
  await ensureCheckinTemplates(c.env);
  const body = await readJson(c);
  const date = cleanString(body.date);
  const session = validateCheckinSession(body.session);
  if (!date || !validateDateString(date)) return jsonError(c, 400, "Date must be YYYY-MM-DD");
  if (!session) return jsonError(c, 400, "Session must be morning or evening");
  if (!Array.isArray(body.answers)) return jsonError(c, 400, "Answers are required");

  const timestamp = nowIso();
  let entry = await first<CheckinEntryRow>(
    c.env,
    "SELECT * FROM checkin_entries WHERE date = ? AND session = ?",
    date,
    session,
  );

  if (!entry) {
    entry = { id: crypto.randomUUID(), date, session, created_at: timestamp, updated_at: timestamp };
    await run(
      c.env,
      "INSERT INTO checkin_entries (id, date, session, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      entry.id,
      entry.date,
      entry.session,
      entry.created_at,
      entry.updated_at,
    );
  } else {
    await run(c.env, "UPDATE checkin_entries SET updated_at = ? WHERE id = ?", timestamp, entry.id);
    entry = { ...entry, updated_at: timestamp };
  }

  await run(c.env, "DELETE FROM checkin_answers WHERE entry_id = ?", entry.id);

  for (const rawAnswer of body.answers) {
    if (!isRecord(rawAnswer)) continue;
    const templateId = cleanString(rawAnswer.template_id);
    if (!templateId) continue;
    const template = await first<CheckinTemplateRow>(c.env, "SELECT * FROM checkin_templates WHERE id = ?", templateId);
    if (!template) return jsonError(c, 400, "A check-in template no longer exists");

    await run(
      c.env,
      "INSERT INTO checkin_answers (id, entry_id, template_id, question_snapshot, answer, position) VALUES (?, ?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      entry.id,
      template.id,
      template.question,
      nullableString(rawAnswer.answer),
      template.position,
    );
  }

  return c.json({ entry: await checkinEntryPayload(c.env, date, session) });
});

function line(value: string | null | undefined) {
  return value?.trim() || "";
}

function fileName(value: string) {
  return `${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"}.md`;
}

api.get("/projects/:id/export", async (c) => {
  const projectId = c.req.param("id");
  const project = await first<ProjectRow>(c.env, "SELECT * FROM projects WHERE id = ?", projectId);
  if (!project) return jsonError(c, 404, "Project not found");

  const people = await all<PersonRow>(c.env, "SELECT * FROM people WHERE project_id = ? ORDER BY name COLLATE NOCASE", projectId);
  const protocols = await all<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE project_id = ? ORDER BY datetime(created_at)", projectId);

  const parts: string[] = [];
  parts.push(`# ${project.title}`);
  parts.push(`Goal: ${line(project.goal)}`);
  parts.push(`Period: ${line(project.started_at)} - ${line(project.ended_at)}`);
  parts.push("");
  parts.push("## People");
  parts.push(...(people.length ? people.map((person) => `- ${person.name}: ${line(person.note)}`) : ["-"]));

  for (const protocol of protocols) {
    const entries = await all<EntryRow>(
      c.env,
      "SELECT * FROM entries WHERE protocol_id = ? ORDER BY datetime(created_at)",
      protocol.id,
    );
    const photos = await all<PhotoRow>(
      c.env,
      "SELECT photos.* FROM photos JOIN entries ON photos.entry_id = entries.id WHERE entries.protocol_id = ? ORDER BY datetime(photos.created_at)",
      protocol.id,
    );
    const todos = await all<TodoRow>(
      c.env,
      "SELECT * FROM todos WHERE protocol_id = ? ORDER BY done ASC, datetime(created_at)",
      protocol.id,
    );
    const todosWithAssignees = await withTodoAssignees(c.env, todos);

    parts.push("");
    parts.push(`## ${protocol.title}`);
    parts.push(`Goal: ${line(protocol.goal)}`);
    parts.push(`Intervention: ${line(protocol.intervention)}`);
    parts.push(`Metrics: ${line(protocol.metrics)}`);
    parts.push(`Deadline: ${line(protocol.deadline)}`);
    parts.push("");
    parts.push("### Entries");

    for (const entry of entries) {
      const entryPhotos = photos.filter((photo) => photo.entry_id === entry.id);
      parts.push("");
      parts.push(`#### ${entry.created_at}`);
      parts.push(line(entry.body));
      parts.push(`Tags: ${parseTags(entry.tags).join(", ")}`);
      parts.push(`Photos: ${entryPhotos.map((photo) => photo.r2_url).join(", ")}`);
    }

    parts.push("");
    parts.push("### To-dos");
    if (!todos.length) {
      parts.push("-");
    }
    for (const todo of todosWithAssignees) {
      const due = todo.due_date ? ` (due: ${todo.due_date})` : "";
      const recurrence = todo.recurrence === "recurring" ? ` (${todo.recurrence_frequency || "daily"})` : "";
      const assignees = todo.assignees.length
        ? ` (people: ${todo.assignees.map((assignee) => `${assignee.role ? `[${assignee.role}] ` : ""}${assignee.name}`).join(", ")})`
        : "";
      parts.push(`- [${todo.done ? "x" : " "}] ${todo.body}${due}${recurrence}${assignees}`);
    }
  }

  return new Response(parts.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName(project.title)}"`,
    },
  });
});

// ============================================================
// Research / article drafting
//
// Ported from the SocialMediaAgent encyclopedia generator. A topic is
// researched via one of four "modes" and drafted into a cited markdown
// article. Three modes (consensus / websearch / gossip) use Gemini's
// built-in Google Search grounding for real sources; europepmc fetches
// peer-reviewed papers from the Europe PMC REST API and feeds them to
// Gemini as an evidence pack.
// ============================================================

type ResearchMode = "consensus" | "websearch" | "europepmc" | "gossip";

const RESEARCH_MODES: ResearchMode[] = ["consensus", "websearch", "europepmc", "gossip"];

type ArticleRow = {
  id: string;
  title: string;
  tags: string | null;
  consensus_body: string | null;
  websearch_body: string | null;
  europepmc_body: string | null;
  gossip_body: string | null;
  sources_consensus: string | null;
  sources_websearch: string | null;
  sources_europepmc: string | null;
  sources_gossip: string | null;
  prompt_consensus: string | null;
  prompt_websearch: string | null;
  prompt_europepmc: string | null;
  prompt_gossip: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type GeminiGroundedResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
};

type ResearchResult = { body: string; tags: string[]; sources: string[] };

const ENCYCLOPEDIA_SYSTEM = `You are writing a concise ARTICLE for a personal research knowledge base. The article is referenced and reused, so it must be factually grounded, easy to scan, and useful for citing.

Return STRICT JSON ONLY with these keys:
{
  "body": "string — markdown content. Use ## headings to structure (e.g. Overview, How it works, Key facts, Common uses, Risks / caveats — adapt to the topic). Be specific, cite numbers where you know them, avoid marketing language. ~300-600 words. Cite sources INLINE using footnote markers like [^1], [^2], [^3] placed right after the sentence they support — do NOT cluster them at the end. The markers' numbers must match the order of the sources array below. Do NOT include footnote definitions in the body — they are appended automatically.",
  "tags": ["3-6 lowercase tags"],
  "sources": ["ordered list of sources, one per [^N] marker used in the body, each as 'Title — https://url'. Every entry MUST contain a real URL you actually found via search. Do NOT fabricate URLs."]
}

If you don't know enough about the topic, say so explicitly in the body. Never invent specific numbers, dosages, or study citations.`;

const RESEARCH_ADDENDA: Record<ResearchMode, string> = {
  consensus: `RESEARCH MODE: CONSENSUS / PEER-REVIEWED EVIDENCE
- Bias your Google searches and citations toward peer-reviewed journal articles, systematic reviews, meta-analyses, RCTs, and clinical guidelines.
- Prefer pubmed.ncbi.nlm.nih.gov, doi.org, nih.gov, nature.com, thelancet.com, bmj.com, cochrane.org style sources.
- Audience: evidence-curious. Lean clinical / mechanistic rather than anecdotal. Do not editorialize.`,
  websearch: `RESEARCH MODE: WEBSEARCH / OPEN WEB
- Use Google Search to find credible open-web sources: articles, expert interviews, reputable explainers.
- Every [^N] marker MUST correspond to a real URL you found. Do NOT invent sources.
- Neutral, informative tone.`,
  europepmc: `RESEARCH MODE: EUROPE PMC / PEER-REVIEWED BIOMEDICAL LITERATURE
- Sources are RESTRICTED to the numbered EVIDENCE PACK provided below. Each is a real peer-reviewed paper with a DOI or PubMed URL.
- Each [^N] marker in your body MUST correspond to the matching numbered evidence entry.
- Lean clinical / mechanistic. Avoid editorializing. If the evidence pack doesn't cover a claim, write "[evidence gap]" and skip that citation.`,
  gossip: `RESEARCH MODE: WEBSEARCH GOSSIP / TABLOID-STYLE STORIES
- Use Google Search to find the dramatic angle: viral Reddit threads, tabloid headlines, celebrity quotes, lawsuits, scandals.
- LEAD HOOK MUST POP — a specific dramatic incident, a celebrity name, or a wild stat. Never open with a definition.
- NAME NAMES and QUOTE VIVID DETAILS: dollar figures, ER visits, suspensions, indictments, "I thought I was going to die" stories.
- Spend more words on the disasters than the endorsements. Don't hedge needlessly, but tag unverified claims with [alleged] / [reported].
- Use these H2 sections: ## The story everyone's whispering about / ## The worst-case stories / ## The people who swear by it / ## The people who got publicly burned / ## What the lawsuits / regulators are doing / ## Bottom line
- Every [^N] marker MUST correspond to a real URL you found. Do NOT invent sources.`,
};

function extractJsonObject(text: string): JsonRecord | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const tryParse = (raw: string): JsonRecord | null => {
    try {
      const parsed = JSON.parse(raw);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(match[0]);
  if (direct) return direct;
  // Gemini sometimes emits raw newlines/tabs inside JSON string values, which is
  // invalid JSON. Escape control chars that occur inside strings, then retry.
  return tryParse(escapeControlCharsInJsonStrings(match[0]));
}

// Walk the candidate JSON and escape raw control characters (newlines, tabs, etc.)
// that appear inside string literals, leaving structural whitespace untouched.
function escapeControlCharsInJsonStrings(raw: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += ch === "\n" ? "\\n" : ch === "\t" ? "\\t" : ch === "\r" ? "\\r" : `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : item == null ? "" : String(item)))
    .map((item) => item.trim())
    .filter(Boolean);
}

// Call Gemini. When `grounded` is true, Google Search grounding is enabled and
// the resolved source URLs are returned alongside the generated text.
async function geminiCompose(
  env: Env,
  system: string,
  user: string,
  grounded: boolean,
): Promise<{ text: string; grounded: Array<{ title: string; url: string }> }> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const model = "gemini-2.5-flash";
  const payload: JsonRecord = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    // 2.5-flash is a thinking model; thinking tokens count against maxOutputTokens,
    // so disable thinking and give the JSON article + sources room not to truncate.
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
  };
  if (grounded) payload.tools = [{ google_search: {} }];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Gemini ${response.status}: ${detail}`);
  }
  const data = await response.json<GeminiGroundedResponse>();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  const groundedSources: Array<{ title: string; url: string }> = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const url = chunk.web?.uri;
    if (!url) continue;
    groundedSources.push({ title: chunk.web?.title || url, url });
  }
  return { text, grounded: groundedSources };
}

// Europe PMC peer-reviewed search (ports web_search.europepmc_search).
async function europePmcSearch(query: string, maxResults = 8): Promise<Array<{ title: string; url: string; body: string }>> {
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.searchParams.set("query", `(${query}) AND (SRC:MED OR SRC:PMC)`);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(maxResults));
  url.searchParams.set("resultType", "core");

  let data: JsonRecord;
  try {
    const response = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!response.ok) return [];
    data = (await response.json()) as JsonRecord;
  } catch {
    return [];
  }

  const resultList = isRecord(data.resultList) ? data.resultList : {};
  const hits = Array.isArray((resultList as JsonRecord).result) ? ((resultList as JsonRecord).result as JsonRecord[]) : [];
  const out: Array<{ title: string; url: string; body: string }> = [];
  for (const hit of hits) {
    let link = "";
    if (hit.doi) link = `https://doi.org/${String(hit.doi)}`;
    else if (hit.pmcid) link = `https://europepmc.org/article/PMC/${String(hit.pmcid)}`;
    else if (hit.pmid) link = `https://pubmed.ncbi.nlm.nih.gov/${String(hit.pmid)}/`;
    else if (hit.id) link = `https://europepmc.org/article/MED/${String(hit.id)}`;
    if (!link) continue;
    const journalInfo = isRecord(hit.journalInfo) ? hit.journalInfo : {};
    const journal = isRecord((journalInfo as JsonRecord).journal) ? ((journalInfo as JsonRecord).journal as JsonRecord).title : "";
    const snippet = String(hit.abstractText ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
    const meta = [String(hit.authorString ?? ""), String(journal ?? ""), String(hit.pubYear ?? ""), snippet]
      .filter(Boolean)
      .join(" · ");
    out.push({ title: String(hit.title ?? link).trim(), url: link, body: meta });
  }
  return out;
}

async function composeGrounded(env: Env, title: string, extra: string, mode: ResearchMode): Promise<ResearchResult> {
  const system = `${ENCYCLOPEDIA_SYSTEM}\n\n${RESEARCH_ADDENDA[mode]}`;
  const userParts = [
    `TOPIC TITLE: ${title}`,
    extra ? `EXTRA DIRECTION: ${extra}` : "",
    "Use Google Search to find real sources, then produce the article as STRICT JSON. Every source MUST include a real URL you actually found.",
  ].filter(Boolean);
  const { text, grounded } = await geminiCompose(env, system, userParts.join("\n\n"), true);

  const parsed = extractJsonObject(text);
  const body = parsed && typeof parsed.body === "string" ? parsed.body : text.trim();
  const tags = parsed ? normalizeTags(parsed.tags) : [];
  const modelSources = parsed ? toStringArray(parsed.sources) : [];

  // Trust the model's source strings (each [^N] maps to one), then append any
  // grounding URLs the model didn't already reference. Mirrors the original
  // Anthropic web_search merge.
  const sources: string[] = [];
  const seen = new Set<string>();
  for (const source of modelSources) {
    sources.push(source);
    const match = source.match(/https?:\/\/\S+/);
    if (match) seen.add(match[0].replace(/[).,\]]+$/, ""));
  }
  for (const g of grounded) {
    if (seen.has(g.url)) continue;
    seen.add(g.url);
    sources.push(g.title && g.title !== g.url ? `${g.title} — ${g.url}` : g.url);
  }
  return { body, tags, sources };
}

async function composeFromEuropePmc(env: Env, title: string, extra: string): Promise<ResearchResult> {
  const query = extra ? `${title} ${extra}` : title;
  const results = await europePmcSearch(query, 8);
  if (!results.length) {
    return {
      body: `## ${title}\n\nNo Europe PMC results were found for this topic. Try refining the title, or run another mode.`,
      tags: [],
      sources: [],
    };
  }
  const evidence = results
    .map((r, i) => `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    Snippet: ${r.body.slice(0, 280)}`)
    .join("\n\n");
  const system =
    `${ENCYCLOPEDIA_SYSTEM}\n\n${RESEARCH_ADDENDA.europepmc}\n\n` +
    "EVIDENCE PACK — the ONLY sources you may cite. Each is numbered [N] with a URL. " +
    "Your [^1], [^2], ... markers MUST correspond to these numbers.\n\n" +
    evidence;
  const userParts = [
    `TOPIC TITLE: ${title}`,
    extra ? `EXTRA DIRECTION: ${extra}` : "",
    "Compose the article using ONLY the numbered evidence-pack sources. Return STRICT JSON.",
  ].filter(Boolean);
  const { text } = await geminiCompose(env, system, userParts.join("\n\n"), false);

  const parsed = extractJsonObject(text);
  const body = parsed && typeof parsed.body === "string" ? parsed.body : text.trim();
  const tags = parsed ? normalizeTags(parsed.tags) : [];
  // Authoritative sources = exactly the evidence-pack URLs, in order. We ignore
  // any sources the model emits so it can't slip in remembered URLs.
  const sources = results.map((r) => (r.title && r.title !== r.url ? `${r.title} — ${r.url}` : r.url));
  return { body, tags, sources };
}

function articlePayload(row: ArticleRow) {
  return {
    id: row.id,
    title: row.title,
    tags: parseTags(row.tags),
    consensus_body: row.consensus_body ?? "",
    websearch_body: row.websearch_body ?? "",
    europepmc_body: row.europepmc_body ?? "",
    gossip_body: row.gossip_body ?? "",
    sources_consensus: parseJsonStringArray(row.sources_consensus),
    sources_websearch: parseJsonStringArray(row.sources_websearch),
    sources_europepmc: parseJsonStringArray(row.sources_europepmc),
    sources_gossip: parseJsonStringArray(row.sources_gossip),
    prompt_consensus: row.prompt_consensus ?? "",
    prompt_websearch: row.prompt_websearch ?? "",
    prompt_europepmc: row.prompt_europepmc ?? "",
    prompt_gossip: row.prompt_gossip ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return toStringArray(parsed);
  } catch {
    return [];
  }
}

api.get("/articles", async (c) => {
  const rows = await all<ArticleRow>(c.env, "SELECT * FROM articles ORDER BY datetime(updated_at) DESC");
  return c.json({ articles: rows.map(articlePayload) });
});

api.post("/articles", async (c) => {
  const body = await readJson(c);
  const title = cleanString(body.title);
  if (!title) return jsonError(c, 400, "Article title is required");
  const timestamp = nowIso();
  const id = crypto.randomUUID();
  await run(
    c.env,
    "INSERT INTO articles (id, title, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    id,
    title,
    JSON.stringify([]),
    timestamp,
    timestamp,
  );
  const row = await first<ArticleRow>(c.env, "SELECT * FROM articles WHERE id = ?", id);
  return c.json({ article: articlePayload(row!) }, 201);
});

api.get("/articles/:id", async (c) => {
  const row = await first<ArticleRow>(c.env, "SELECT * FROM articles WHERE id = ?", c.req.param("id"));
  if (!row) return jsonError(c, 404, "Article not found");
  return c.json({ article: articlePayload(row) });
});

api.put("/articles/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<{ id: string }>(c.env, "SELECT id FROM articles WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Article not found");
  const body = await readJson(c);
  const title = cleanString(body.title);
  if (!title) return jsonError(c, 400, "Article title is required");
  const timestamp = nowIso();
  await run(
    c.env,
    `UPDATE articles SET
       title = ?, tags = ?,
       consensus_body = ?, websearch_body = ?, europepmc_body = ?, gossip_body = ?,
       sources_consensus = ?, sources_websearch = ?, sources_europepmc = ?, sources_gossip = ?,
       prompt_consensus = ?, prompt_websearch = ?, prompt_europepmc = ?, prompt_gossip = ?,
       updated_at = ?
     WHERE id = ?`,
    title,
    JSON.stringify(normalizeTags(body.tags)),
    nullableString(body.consensus_body),
    nullableString(body.websearch_body),
    nullableString(body.europepmc_body),
    nullableString(body.gossip_body),
    JSON.stringify(toStringArray(body.sources_consensus)),
    JSON.stringify(toStringArray(body.sources_websearch)),
    JSON.stringify(toStringArray(body.sources_europepmc)),
    JSON.stringify(toStringArray(body.sources_gossip)),
    nullableString(body.prompt_consensus),
    nullableString(body.prompt_websearch),
    nullableString(body.prompt_europepmc),
    nullableString(body.prompt_gossip),
    timestamp,
    id,
  );
  const row = await first<ArticleRow>(c.env, "SELECT * FROM articles WHERE id = ?", id);
  return c.json({ article: articlePayload(row!) });
});

api.delete("/articles/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<{ id: string }>(c.env, "SELECT id FROM articles WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Article not found");
  await run(c.env, "DELETE FROM articles WHERE id = ?", id);
  return c.json({ ok: true });
});

// Research a topic and return a drafted article for one mode. Not persisted —
// the client merges the result into the matching tab and saves via PUT.
api.post("/articles/research", async (c) => {
  const body = await readJson(c);
  const title = cleanString(body.title);
  const modeValue = cleanString(body.mode) ?? "websearch";
  const extra = nullableString(body.prompt) ?? "";
  if (!title) return jsonError(c, 400, "Title is required");
  if (!RESEARCH_MODES.includes(modeValue as ResearchMode)) return jsonError(c, 400, "Invalid research mode");
  if (!c.env.GEMINI_API_KEY) return jsonError(c, 500, "GEMINI_API_KEY is not configured");
  const mode = modeValue as ResearchMode;
  try {
    const result = mode === "europepmc"
      ? await composeFromEuropePmc(c.env, title, extra)
      : await composeGrounded(c.env, title, extra, mode);
    return c.json({ ...result, mode, prompt: extra });
  } catch (error) {
    return jsonError(c, 500, error instanceof Error ? error.message : "Research failed");
  }
});

// Rewrite a raw note into a short, natural-sounding post for the team chat.
api.post("/telegram/reformat", async (c) => {
  if (!c.env.GEMINI_API_KEY) return jsonError(c, 500, "GEMINI_API_KEY is not configured");
  const body = await readJson(c);
  const note = cleanString(body.text);
  if (!note) return jsonError(c, 400, "Note text is required");
  const system =
    "You rewrite a person's raw note into one coherent sentence for a team chat, in the first person, " +
    "as if they are describing what they observed or learned. " +
    "Preserve the full essence and every detail of the note — do not add, invent, or embellish any information, " +
    "and do not pad it; keep it as short as the note itself is. " +
    "No preamble, no hashtags, no quotation marks, no markdown. Return only the single sentence.";
  try {
    const { text } = await geminiCompose(c.env, system, note, false);
    return c.json({ post: text.trim() });
  } catch (error) {
    return jsonError(c, 500, error instanceof Error ? error.message : "Could not reformat note");
  }
});

// Send a message to the configured Telegram group via the Bot API.
api.post("/telegram/post", async (c) => {
  const body = await readJson(c);
  const text = cleanString(body.text);
  if (!text) return jsonError(c, 400, "Message text is required");
  if (!c.env.TELEGRAM_BOT_TOKEN || !c.env.TELEGRAM_CHAT_ID) {
    return jsonError(c, 500, "Telegram is not configured");
  }
  const account = (await getSetting(c.env, "profile_name")) || c.get("user").email;
  const message = `${text}\n\n— ${account}`;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: c.env.TELEGRAM_CHAT_ID, text: message }),
      },
    );
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      return jsonError(c, 500, `Telegram ${response.status}: ${detail}`);
    }
    return c.json({ ok: true });
  } catch (error) {
    return jsonError(c, 500, error instanceof Error ? error.message : "Could not post to Telegram");
  }
});

app.route("/api", api);

app.onError((error, c) => {
  console.error(error);
  return jsonError(c, 500, "Internal server error");
});

export default app;
