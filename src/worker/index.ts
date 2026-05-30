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

type TodoRow = {
  id: string;
  protocol_id: string;
  body: string;
  done: 0 | 1;
  due_date: string | null;
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

type PersonRow = {
  id: string;
  project_id: string;
  name: string;
  note: string | null;
  created_at: string;
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

async function deletePhotosByRows(env: Env, photos: PhotoRow[]) {
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
  await deletePhotosByRows(c.env, photos);
  await run(c.env, "DELETE FROM projects WHERE id = ?", id);
  return c.json({ ok: true });
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

  const timestamp = nowIso();
  const protocol: ProtocolRow = {
    id: crypto.randomUUID(),
    project_id: projectId,
    title,
    goal: nullableString(body.goal),
    intervention: nullableString(body.intervention),
    metrics: nullableString(body.metrics),
    deadline: nullableString(body.deadline),
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
    `SELECT todos.*, people.name AS person_name,
      protocols.title AS protocol_title,
      protocols.project_id AS project_id,
      projects.title AS project_title
     FROM todos
     JOIN protocols ON protocols.id = todos.protocol_id
     JOIN projects ON projects.id = protocols.project_id
     LEFT JOIN people ON people.id = todos.person_id
     WHERE todos.done = 0 AND projects.status = 'active'
     ORDER BY COALESCE(todos.position, todos.rowid) ASC, datetime(todos.created_at) ASC`,
  );
  const completedToday = await all<TodoRow>(
    c.env,
    `SELECT todos.*, people.name AS person_name,
      protocols.title AS protocol_title,
      protocols.project_id AS project_id,
      projects.title AS project_title
     FROM todos
     JOIN protocols ON protocols.id = todos.protocol_id
     JOIN projects ON projects.id = protocols.project_id
     LEFT JOIN people ON people.id = todos.person_id
     WHERE todos.done = 1 AND projects.status = 'active' AND substr(todos.updated_at, 1, 10) = ?
     ORDER BY datetime(todos.updated_at) DESC`,
    today,
  );
  return c.json({ todos: openTodos, completed_today: completedToday });
});

api.get("/protocols/:id/todos", async (c) => {
  const protocolId = c.req.param("id");
  const protocol = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", protocolId);
  if (!protocol) return jsonError(c, 404, "Protocol not found");

  const todos = await all<TodoRow>(
    c.env,
    `SELECT todos.*, people.name AS person_name
     FROM todos
     LEFT JOIN people ON people.id = todos.person_id
     WHERE todos.protocol_id = ?
     ORDER BY todos.done ASC, COALESCE(todos.position, todos.rowid) ASC, COALESCE(todos.due_date, '') ASC, datetime(todos.created_at) DESC`,
    protocolId,
  );
  return c.json({ todos });
});

async function protocolProject(env: Env, protocolId: string) {
  return await first<ProtocolRow & { project_id: string }>(
    env,
    "SELECT protocols.* FROM protocols WHERE protocols.id = ?",
    protocolId,
  );
}

async function validPersonForProtocol(env: Env, protocolId: string, personId: string | null) {
  if (!personId) return true;
  const protocol = await protocolProject(env, protocolId);
  if (!protocol) return false;
  const person = await first<PersonRow>(env, "SELECT * FROM people WHERE id = ? AND project_id = ?", personId, protocol.project_id);
  return Boolean(person);
}

api.post("/protocols/:id/todos", async (c) => {
  const protocolId = c.req.param("id");
  const protocol = await first<ProtocolRow>(c.env, "SELECT * FROM protocols WHERE id = ?", protocolId);
  if (!protocol) return jsonError(c, 404, "Protocol not found");

  const body = await readJson(c);
  const todoBody = cleanString(body.body);
  if (!todoBody) return jsonError(c, 400, "To-do body is required");

  const personId = nullableString(body.person_id);
  if (!(await validPersonForProtocol(c.env, protocolId, personId))) return jsonError(c, 400, "Person does not belong to this project");
  const personRole = validateTodoPersonRole(body.person_role);
  if (personRole === undefined) return jsonError(c, 400, "Invalid RASCI role");

  const timestamp = nowIso();
  const maxPosition = await first<{ position: number | null }>(c.env, "SELECT MAX(position) AS position FROM todos");
  const todo: TodoRow = {
    id: crypto.randomUUID(),
    protocol_id: protocolId,
    body: todoBody,
    done: body.done === true || body.done === 1 ? 1 : 0,
    due_date: nullableString(body.due_date),
    person_id: personId,
    person_role: personId ? personRole : null,
    position: (maxPosition?.position || 0) + 1,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await run(
    c.env,
    "INSERT INTO todos (id, protocol_id, body, done, due_date, person_id, person_role, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    todo.id,
    todo.protocol_id,
    todo.body,
    todo.done,
    todo.due_date,
    todo.person_id,
    todo.person_role,
    todo.position,
    todo.created_at,
    todo.updated_at,
  );
  return c.json({ todo }, 201);
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
  let nextPersonId = existing.person_id;
  if (hasOwn(body, "person_id")) {
    const personId = nullableString(body.person_id);
    if (!(await validPersonForProtocol(c.env, existing.protocol_id, personId))) {
      return jsonError(c, 400, "Person does not belong to this project");
    }
    nextPersonId = personId;
    sets.push("person_id = ?");
    values.push(personId);
  }
  if (hasOwn(body, "person_role")) {
    const personRole = validateTodoPersonRole(body.person_role);
    if (personRole === undefined) return jsonError(c, 400, "Invalid RASCI role");
    sets.push("person_role = ?");
    values.push(nextPersonId ? personRole : null);
  } else if (hasOwn(body, "person_id") && !nextPersonId) {
    sets.push("person_role = ?");
    values.push(null);
  }

  if (!sets.length) return c.json({ todo: existing });
  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  await run(c.env, `UPDATE todos SET ${sets.join(", ")} WHERE id = ?`, ...values);

  const todo = await first<TodoRow>(
    c.env,
    "SELECT todos.*, people.name AS person_name FROM todos LEFT JOIN people ON people.id = todos.person_id WHERE todos.id = ?",
    id,
  );
  return c.json({ todo });
});

api.delete("/todos/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<TodoRow>(c.env, "SELECT * FROM todos WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "To-do not found");
  await run(c.env, "DELETE FROM todos WHERE id = ?", id);
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
  const name = cleanString(body.name);
  if (!name) return jsonError(c, 400, "Person name is required");

  const person: PersonRow = {
    id: crypto.randomUUID(),
    project_id: projectId,
    name,
    note: nullableString(body.note),
    created_at: nowIso(),
  };

  await run(
    c.env,
    "INSERT INTO people (id, project_id, name, note, created_at) VALUES (?, ?, ?, ?, ?)",
    person.id,
    person.project_id,
    person.name,
    person.note,
    person.created_at,
  );
  return c.json({ person }, 201);
});

api.patch("/people/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<PersonRow>(c.env, "SELECT * FROM people WHERE id = ?", id);
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
  values.push(id);
  await run(c.env, `UPDATE people SET ${sets.join(", ")} WHERE id = ?`, ...values);

  const person = await first<PersonRow>(c.env, "SELECT * FROM people WHERE id = ?", id);
  return c.json({ person });
});

api.delete("/people/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await first<PersonRow>(c.env, "SELECT * FROM people WHERE id = ?", id);
  if (!existing) return jsonError(c, 404, "Person not found");
  await run(c.env, "UPDATE todos SET person_id = NULL, updated_at = ? WHERE person_id = ?", nowIso(), id);
  await run(c.env, "DELETE FROM people WHERE id = ?", id);
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
      "SELECT todos.*, people.name AS person_name FROM todos LEFT JOIN people ON people.id = todos.person_id WHERE todos.protocol_id = ? ORDER BY todos.done ASC, datetime(todos.created_at)",
      protocol.id,
    );

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
    for (const todo of todos) {
      const due = todo.due_date ? ` (due: ${todo.due_date})` : "";
      const person = todo.person_name ? ` (person: ${todo.person_name})` : "";
      parts.push(`- [${todo.done ? "x" : " "}] ${todo.body}${due}${person}`);
    }
  }

  return new Response(parts.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName(project.title)}"`,
    },
  });
});

app.route("/api", api);

app.onError((error, c) => {
  console.error(error);
  return jsonError(c, 500, "Internal server error");
});

export default app;
