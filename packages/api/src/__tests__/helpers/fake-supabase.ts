// ---------------------------------------------------------------------------
// Minimal in-memory stand-in for the Supabase client (tables + storage).
// Supports the query-builder chains used by the bank statement routes and
// the AI pipeline: select/insert/update/delete with eq/neq/is/in/like/gte/lte,
// order, single/maybeSingle, and awaiting the builder directly.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
type Result = { data: any; error: { message: string; code?: string } | null };

export interface FakeSupabase {
  tables: Record<string, Row[]>;
  /** Paths currently stored in the "bank-statements" bucket. */
  files: Set<string>;
  /** Optional contents returned by storage.download(), keyed by path. */
  fileContents: Record<string, string>;
  /** Every path passed to storage.remove(), in call order. */
  removedFiles: string[];
  /** Ordered log of storage calls, e.g. "remove:path", "upload:path". */
  storageLog: string[];
  /** Make the next insert into `table` fail with `message`. */
  failNextInsert(table: string, message: string): void;
  /** Make storage.remove() fail with `message` until cleared (null). */
  setRemoveError(message: string | null): void;
  from(table: string): any;
  storage: { from(bucket: string): any };
}

function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`);
}

export function createFakeSupabase(initial: Record<string, Row[]> = {}, files: string[] = []): FakeSupabase {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const fileSet = new Set(files);
  const fileContents: Record<string, string> = {};
  const removedFiles: string[] = [];
  const storageLog: string[] = [];
  const insertErrors: Record<string, string> = {};
  let removeError: string | null = null;
  let idCounter = 0;

  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: any;

    constructor(private table: string) {
      tables[table] ??= [];
    }

    select(_cols?: string) { return this; }
    insert(payload: any) { this.op = "insert"; this.payload = payload; return this; }
    update(payload: any) { this.op = "update"; this.payload = payload; return this; }
    delete() { this.op = "delete"; return this; }
    eq(col: string, val: any) { this.filters.push((r) => r[col] === val); return this; }
    neq(col: string, val: any) { this.filters.push((r) => r[col] !== val); return this; }
    is(col: string, val: any) { this.filters.push((r) => (r[col] ?? null) === val); return this; }
    in(col: string, vals: any[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
    like(col: string, pattern: string) {
      const re = likeToRegExp(pattern);
      this.filters.push((r) => typeof r[col] === "string" && re.test(r[col]));
      return this;
    }
    gte(col: string, val: any) { this.filters.push((r) => r[col] >= val); return this; }
    lte(col: string, val: any) { this.filters.push((r) => r[col] <= val); return this; }
    order() { return this; }
    limit() { return this; }

    single(): Promise<Result> {
      return this.exec().then(({ data, error }) => {
        if (error) return { data: null, error };
        const rows = Array.isArray(data) ? data : [data];
        if (rows.length !== 1) {
          return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
        }
        return { data: rows[0], error: null };
      });
    }

    maybeSingle(): Promise<Result> {
      return this.exec().then(({ data, error }) => {
        if (error) return { data: null, error };
        const rows = Array.isArray(data) ? data : [data];
        return { data: rows[0] ?? null, error: null };
      });
    }

    then<T1 = Result, T2 = never>(
      onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onRejected?: ((reason: any) => T2 | PromiseLike<T2>) | null
    ): Promise<T1 | T2> {
      return this.exec().then(onFulfilled, onRejected);
    }

    private matches(r: Row) {
      return this.filters.every((f) => f(r));
    }

    private async exec(): Promise<Result> {
      const rows = tables[this.table];
      switch (this.op) {
        case "select":
          return { data: rows.filter((r) => this.matches(r)).map((r) => ({ ...r })), error: null };
        case "insert": {
          if (insertErrors[this.table]) {
            const message = insertErrors[this.table];
            delete insertErrors[this.table];
            return { data: null, error: { message } };
          }
          const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => ({
            id: p.id ?? `${this.table}-gen-${++idCounter}`,
            ...p,
          }));
          rows.push(...items);
          return { data: items.map((r: Row) => ({ ...r })), error: null };
        }
        case "update": {
          const updated = rows.filter((r) => this.matches(r));
          for (const r of updated) Object.assign(r, this.payload);
          return { data: updated.map((r) => ({ ...r })), error: null };
        }
        case "delete": {
          const removed = rows.filter((r) => this.matches(r));
          tables[this.table] = rows.filter((r) => !this.matches(r));
          return { data: removed, error: null };
        }
      }
    }
  }

  const bucket = {
    upload: async (path: string, _body: any, opts?: { upsert?: boolean }) => {
      storageLog.push(`upload:${path}`);
      if (fileSet.has(path) && !opts?.upsert) {
        return { data: null, error: { message: "The resource already exists" } };
      }
      fileSet.add(path);
      return { data: { path }, error: null };
    },
    remove: async (paths: string[]) => {
      for (const p of paths) storageLog.push(`remove:${p}`);
      if (removeError) return { data: null, error: { message: removeError } };
      removedFiles.push(...paths);
      // Like Supabase, removing a missing object is not an error.
      const data = paths.filter((p) => fileSet.has(p)).map((name) => ({ name }));
      for (const p of paths) fileSet.delete(p);
      return { data, error: null };
    },
    download: async (path: string) => {
      storageLog.push(`download:${path}`);
      if (!fileSet.has(path)) return { data: null, error: { message: "Object not found" } };
      return { data: new Blob([fileContents[path] ?? "file contents"]), error: null };
    },
  };

  return {
    tables,
    files: fileSet,
    fileContents,
    removedFiles,
    storageLog,
    failNextInsert(table, message) {
      insertErrors[table] = message;
    },
    setRemoveError(message) {
      removeError = message;
    },
    from: (table: string) => new Query(table),
    storage: { from: (_bucket: string) => bucket },
  };
}
