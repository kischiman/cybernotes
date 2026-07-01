/**
 * cybernotes-github.ts
 * -------------------------------------------------------------------------
 * Stores notes from the app into the GitHub repo that mirrors the Obsidian
 * "Cybernotes" vault (kischiman/Cybernotes, private).
 *
 * Talks to the GitHub Contents/Trees API directly via `fetch`, so it runs in
 * Cloudflare Workers with no npm dependencies. The token is server-side only.
 * -------------------------------------------------------------------------
 */

export interface CybernotesRepoConfig {
  /** GitHub Personal Access Token with Contents read/write on the repo. */
  token: string;
  /** Repo owner. Default: "kischiman". */
  owner?: string;
  /** Repo name. Default: "Cybernotes". */
  repo?: string;
  /** Branch to commit to. Default: "main". */
  branch?: string;
  /** Name shown on commits. Default: "Cybernotes App". */
  committerName?: string;
  /** Email shown on commits. Default: "andrej@deepwork.studio". */
  committerEmail?: string;
}

export interface SaveNoteOptions {
  /** Human title — also used to build the filename. */
  title: string;
  /** Markdown body of the note (no frontmatter; this module adds it). */
  body: string;
  /** Folder to file it under, e.g. "Health & Body" or a new one. Default: "Inbox". */
  category?: string;
  /** Extra YAML frontmatter keys (priority, tags, source, etc.). */
  frontmatter?: Record<string, unknown>;
  /** If true, append a short timestamp+id so repeated titles never overwrite. */
  unique?: boolean;
  /** Override the commit message. */
  commitMessage?: string;
}

export interface SaveNoteResult {
  path: string;
  /** "created" or "updated". */
  action: "created" | "updated";
  /** Commit SHA. */
  commit: string;
  /** Web URL to the file on GitHub. */
  url: string;
}

export class CybernotesRepo {
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly committerName: string;
  private readonly committerEmail: string;
  private readonly api = "https://api.github.com";

  constructor(cfg: CybernotesRepoConfig) {
    if (!cfg.token) throw new Error("CybernotesRepo: a GitHub token is required.");
    this.token = cfg.token;
    this.owner = cfg.owner ?? "kischiman";
    this.repo = cfg.repo ?? "Cybernotes";
    this.branch = cfg.branch ?? "main";
    this.committerName = cfg.committerName ?? "Cybernotes App";
    this.committerEmail = cfg.committerEmail ?? "andrej@deepwork.studio";
  }

  /** Create or update a single note. Idempotent on (category, title) unless `unique`. */
  async saveNote(opts: SaveNoteOptions): Promise<SaveNoteResult> {
    const category = (opts.category ?? "Inbox").trim();
    const slug = slugify(opts.title);
    const filename = opts.unique ? `${slug}-${shortId()}.md` : `${slug}.md`;
    const path = `${sanitizeFolder(category)}/${filename}`;

    const markdown = buildMarkdown(opts.title, opts.body, {
      category,
      created: new Date().toISOString(),
      ...(opts.frontmatter ?? {}),
    });

    return this.putFile(
      path,
      markdown,
      opts.commitMessage ?? `Add note: ${opts.title}`,
    );
  }

  /** List every folder (directory path) in the repo, for the category picker. */
  async listFolders(): Promise<string[]> {
    const url = `${this.api}/repos/${this.owner}/${this.repo}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`GitHub list folders failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { tree?: Array<{ path: string; type: string }> };
    const folders = (data.tree ?? [])
      .filter((entry) => entry.type === "tree")
      .map((entry) => entry.path);
    return [...new Set(folders)].sort((a, b) => a.localeCompare(b));
  }

  /** Low-level upsert of any file path with string content. Handles create vs update. */
  async putFile(path: string, content: string, message: string): Promise<SaveNoteResult> {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = `${this.api}/repos/${this.owner}/${this.repo}/contents/${encodedPath}`;

    // Look up existing file to get its sha (required when updating).
    let sha: string | undefined;
    const head = await fetch(`${url}?ref=${this.branch}`, { headers: this.headers() });
    if (head.status === 200) {
      sha = ((await head.json()) as { sha: string }).sha;
    } else if (head.status !== 404) {
      throw new Error(`GitHub GET ${path} failed: ${head.status} ${await head.text()}`);
    }

    const res = await fetch(url, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({
        message,
        content: toBase64(content),
        branch: this.branch,
        sha,
        committer: { name: this.committerName, email: this.committerEmail },
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub PUT ${path} failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      content: { html_url: string };
      commit: { sha: string };
    };
    return {
      path,
      action: sha ? "updated" : "created",
      commit: data.commit.sha,
      url: data.content.html_url,
    };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "cybernotes-app",
    };
  }
}

/* ----------------------------- helpers ----------------------------- */

/** Build a markdown file with YAML frontmatter. Uses literal block scalars
 *  for any multi-line string so the YAML always stays valid. */
export function buildMarkdown(
  title: string,
  body: string,
  frontmatter: Record<string, unknown>,
): string {
  const lines: string[] = ["---", `title: ${yamlScalar(title)}`];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yamlScalar(String(item))}`);
    } else if (typeof value === "string" && value.includes("\n")) {
      lines.push(`${key}: |`);
      for (const ln of value.split("\n")) lines.push(`  ${ln}`);
    } else {
      lines.push(`${key}: ${yamlScalar(String(value))}`);
    }
  }
  lines.push("---", "", `# ${title}`, "", body.trim(), "");
  return lines.join("\n");
}

/** Quote a YAML scalar only when it needs it. */
function yamlScalar(s: string): string {
  if (s === "") return '""';
  if (/^[\w .,&()/'-]+$/.test(s) && !/^[\s>|@`%#&*!?{}[\],]/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Turn a title into a safe filename slug (keeps spaces readable, strips junk). */
export function slugify(title: string): string {
  return (
    title
      .trim()
      .replace(/[\\/:*?"<>|#%{}]+/g, "") // chars illegal in paths / Obsidian
      .replace(/\s+/g, " ")
      .slice(0, 80)
      .trim() || "untitled"
  );
}

/** Keep a category usable as a folder path (allows nested "a/b" segments). */
export function sanitizeFolder(category: string): string {
  return (
    category
      .split("/")
      .map((segment) =>
        segment
          .replace(/[\\:*?"<>|#%{}]+/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .join("/") || "Inbox"
  );
}

/** Short, sortable, collision-resistant id: e.g. "20260630-1430-a1b2". */
function shortId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}`;
  const rand = Math.random().toString(16).slice(2, 6);
  return `${stamp}-${rand}`;
}

/** UTF-8 safe base64 that works in Node and the browser/edge. */
function toBase64(str: string): string {
  const g = globalThis as { Buffer?: { from(s: string, e: string): { toString(e: string): string } } };
  if (typeof g.Buffer !== "undefined") return g.Buffer.from(str, "utf-8").toString("base64");
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
