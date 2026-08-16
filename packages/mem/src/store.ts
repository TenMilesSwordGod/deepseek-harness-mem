/**
 * SQLite-backed memory store on node:sqlite. Embeddings are stored as raw
 * float32 LE blobs; similarity is a cosine over candidates loaded per scope,
 * which keeps the store dependency-free and fast for small memory corpora.
 * @module @deepseek-ai/simplemem
 */

import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { MemoryScope, MemHit } from './types.ts'

/** Bump when the on-disk schema changes incompatibly. */
const SCHEMA_VERSION = 5

/** One stored row as read from SQLite. */
interface MemoryRow {
  id: string
  content: string
  tags: string
  scope: MemoryScope
  project: string | null
  session_id: string | null
  embedding: Uint8Array
  dims: number
  enabled: number
  pinned: number
  use_count: number
  created_at: number
}

const CREATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS mem_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'project',
  project TEXT,
  session_id TEXT,
  embedding BLOB NOT NULL,
  dims INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  pinned INTEGER NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_scope_project ON memories(scope, project);
`

/** Decode one blob into a float32 vector of the expected length. */
function decodeEmbedding(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4))
}

/** Cosine similarity between two same-length vectors (embedded already normalized). */
function cosine(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Scope filter fragment for one (scope, project) pair. */

/**
 * SQLite memory store: schema, record-with-dedup, cosine search, and stats.
 * All statements are prepared once; writes go through synchronous calls.
 */
export class MemoryStore {
  readonly dbPath: string
  readonly #db: DatabaseSync
  readonly #insert: ReturnType<DatabaseSync['prepare']>
  readonly #selectScope: ReturnType<DatabaseSync['prepare']>
  readonly #updateEmbedding: ReturnType<DatabaseSync['prepare']>
  readonly #setEnabled: ReturnType<DatabaseSync['prepare']>
  readonly #stale: ReturnType<DatabaseSync['prepare']>
  readonly #deleteId: ReturnType<DatabaseSync['prepare']>
  readonly #count: ReturnType<DatabaseSync['prepare']>
  readonly #recent: ReturnType<DatabaseSync['prepare']>

  constructor(dbPath: string) {
    this.dbPath = dbPath
    mkdirSync(dirname(dbPath), { recursive: true })
    this.#db = new DatabaseSync(dbPath)
    this.#db.exec('PRAGMA journal_mode = WAL')
    this.#db.exec('PRAGMA synchronous = NORMAL')
    this.#db.exec(CREATE_SCHEMA)
    const current = this.#db.prepare('SELECT value FROM mem_meta WHERE key = ?').get('schema_version') as
      | { value: string }
      | undefined
    const version = current === undefined ? null : Number(current.value)
    if (version === null) {
      this.#db.prepare('INSERT INTO mem_meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION))
    } else if (version === 1) {
      // v1 -> v2: rows gain a dims column; v1 stored nomic 768d embeddings.
      this.#db.exec('ALTER TABLE memories ADD COLUMN dims INTEGER NOT NULL DEFAULT 768')
      this.#db.exec('ALTER TABLE memories ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1')
      this.#db.exec('ALTER TABLE memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
      this.#db.prepare('UPDATE mem_meta SET value = ? WHERE key = ?').run(String(SCHEMA_VERSION), 'schema_version')
    } else if (version === 2) {
      // v2 -> v3: rows gain the enabled flag.
      this.#db.exec('ALTER TABLE memories ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1')
      this.#db.exec('ALTER TABLE memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
      this.#db.prepare('UPDATE mem_meta SET value = ? WHERE key = ?').run(String(SCHEMA_VERSION), 'schema_version')
    } else if (version === 3) {
      // v3 -> v4: rows gain the pinned flag (always-injected rules).
      this.#db.exec('ALTER TABLE memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
      this.#db.prepare('UPDATE mem_meta SET value = ? WHERE key = ?').run(String(SCHEMA_VERSION), 'schema_version')
    } else if (version === 4) {
      // v4 -> v5: rows gain a retrieval usage counter (consolidation signal).
      this.#db.exec('ALTER TABLE memories ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0')
      this.#db.prepare('UPDATE mem_meta SET value = ? WHERE key = ?').run(String(SCHEMA_VERSION), 'schema_version')
    } else if (version !== SCHEMA_VERSION) {
      throw new Error(`mem store schema version ${version} is unsupported (expected ${SCHEMA_VERSION})`)
    }
    this.#insert = this.#db.prepare(
      'INSERT INTO memories (id, content, tags, scope, project, session_id, embedding, dims, pinned, use_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    this.#selectScope = this.#db.prepare(
      'SELECT id, content, tags, scope, project, session_id, embedding, dims, enabled, pinned, use_count, created_at FROM memories WHERE scope = ? ORDER BY created_at DESC',
    )
    this.#setEnabled = this.#db.prepare('UPDATE memories SET enabled = ?, updated_at = ? WHERE id = ?')
    this.#updateEmbedding = this.#db.prepare(
      'UPDATE memories SET embedding = ?, dims = ?, updated_at = ? WHERE id = ?',
    )
    this.#stale = this.#db.prepare(
      'SELECT id, content, embedding FROM memories WHERE dims != ? ORDER BY created_at ASC',
    )
    this.#deleteId = this.#db.prepare('DELETE FROM memories WHERE id = ?')
    this.#count = this.#db.prepare('SELECT COUNT(*) AS n FROM memories')
    this.#recent = this.#db.prepare(
      'SELECT id, content, tags, scope, project, created_at FROM memories ORDER BY created_at DESC LIMIT 1000',
    )
  }

  /** Read one persisted meta value by key. */
  metaGet(key: string): string | null {
    const row = this.#db.prepare('SELECT value FROM mem_meta WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  /** Persist one meta value by key (upsert). */
  metaSet(key: string, value: string): void {
    this.#db.prepare(
      'INSERT INTO mem_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, value)
  }

  /** Total row count across every scope. */
  count(): number {
    return Number((this.#count.get() as { n: number }).n)
  }

  /** All rows of one scope axis, newest first (candidates for dedup/search); disabled rows are excluded. */
  #candidates(scope: MemoryScope, project: string | null, dims: number): MemoryRow[] {
    const enabled = (rows: MemoryRow[]) => rows.filter((row) => row.dims === dims && row.enabled === 1)
    const rows = enabled(this.#selectScope.all(scope === 'global' ? 'global' : 'project') as unknown as MemoryRow[])
    if (scope === 'global') return rows
    if (project === null) return rows
    const globalRows = enabled(this.#selectScope.all('global') as unknown as MemoryRow[])
    return [
      ...rows.filter((row) => row.project === project),
      ...globalRows,
    ]
  }

  /**
   * Record one memory unless a same-scope near twin exists.
   * @param content - normalized content text.
   * @param tags - comma-separated lowercase tags (may be '').
   * @param scope - 'project' or 'global'.
   * @param project - canonical project key for project scope, else null.
   * @param sessionId - owning session id, or null.
   * @param embedding - float32 vector matching the configured dimension.
   * @param dedupThreshold - similarity at or above which the insert is skipped.
   * @returns insert outcome with the twin similarity when deduplicated.
   */
  record(
    content: string,
    tags: string,
    scope: MemoryScope,
    project: string | null,
    sessionId: string | null,
    embedding: Float32Array,
    dims: number,
    dedupThreshold: number,
    pinned = false,
  ): { status: 'recorded' | 'deduplicated'; id: string; similarity?: number } {
    const candidates = this.#candidates(scope, project, dims)
    for (const row of candidates) {
      const similarity = cosine(decodeEmbedding(row.embedding), embedding)
      if (similarity >= dedupThreshold) {
        return { status: 'deduplicated', id: row.id, similarity }
      }
    }
    const id = `mem-${randomUUID()}`
    const now = Date.now()
    this.#insert.run(id, content, tags, scope, project, sessionId, embedding, dims, pinned ? 1 : 0, 0, now, now)
    return { status: 'recorded', id }
  }

  /**
   * Ranked cosine search over one scope axis. Every returned hit's usage
   * counter is incremented — the consolidation feature uses the count to
   * decide what is rarely used (drop) vs. broadly matched (retag).
   * @param embedding - query vector.
   * @param scope - 'project' or 'global'.
   * @param project - canonical project key for project scope, else null.
   * @param limit - result cap.
   * @param minSimilarity - drop hits below this similarity.
   * @returns hits ordered by descending similarity.
   */
  search(
    embedding: Float32Array,
    scope: MemoryScope,
    project: string | null,
    dims: number,
    limit: number,
    minSimilarity: number,
  ): MemHit[] {
    const scored: MemHit[] = []
    for (const row of this.#candidates(scope, project, dims)) {
      const similarity = cosine(decodeEmbedding(row.embedding), embedding)
      if (similarity < minSimilarity) continue
      scored.push({
        id: row.id,
        content: row.content,
        tags: row.tags,
        scope: row.scope,
        similarity,
        createdAt: row.created_at,
      })
    }
    scored.sort((a, b) => b.similarity - a.similarity)
    const hits = scored.slice(0, limit)
    for (const hit of hits) {
      this.#db.prepare('UPDATE memories SET use_count = use_count + 1 WHERE id = ?').run(hit.id)
    }
    return hits
  }

  /** Load rows by id (consolidation analysis); disabled rows are excluded. */
  getByIds(ids: string[]): Array<{
    id: string
    content: string
    tags: string
    scope: MemoryScope
    project: string | null
    pinned: boolean
    enabled: boolean
    useCount: number
    createdAt: number
  }> {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.#db.prepare(
      `SELECT id, content, tags, scope, project, pinned, enabled, use_count, created_at FROM memories WHERE id IN (${placeholders})`,
    ).all(...ids) as unknown as Array<{
      id: string
      content: string
      tags: string
      scope: MemoryScope
      project: string | null
      pinned: number
      enabled: number
      use_count: number
      created_at: number
    }>
    return rows
      .filter((row) => row.enabled === 1)
      .map((row) => ({
        id: row.id,
        content: row.content,
        tags: row.tags,
        scope: row.scope,
        project: row.project,
        pinned: row.pinned === 1,
        enabled: true,
        useCount: row.use_count,
        createdAt: row.created_at,
      }))
  }

  /** Replace one memory's content and tags (consolidation rewrite/retag). */
  updateContent(id: string, content: string, tags: string): boolean {
    const result = this.#db.prepare('UPDATE memories SET content = ?, tags = ?, updated_at = ? WHERE id = ?').run(content, tags, Date.now(), id)
    return result.changes > 0
  }

  /** Rewrite one memory with fresh content, tags, and embedding (consolidation). */
  rewrite(id: string, content: string, tags: string, embedding: Float32Array, dims: number): boolean {
    const result = this.#db.prepare(
      'UPDATE memories SET content = ?, tags = ?, embedding = ?, dims = ?, updated_at = ? WHERE id = ?',
    ).run(content, tags, embedding, dims, Date.now(), id)
    return result.changes > 0
  }

  /** Replace only the tags of one memory (consolidation retag). */
  updateTags(id: string, tags: string): boolean {
    const result = this.#db.prepare('UPDATE memories SET tags = ?, updated_at = ? WHERE id = ?').run(tags, Date.now(), id)
    return result.changes > 0
  }

  /** Rows whose embedding dimensions differ from the active model. */
  staleCount(dims: number): number {
    return Number((this.#db.prepare('SELECT COUNT(*) AS n FROM memories WHERE dims != ?').get(dims) as { n: number }).n)
  }

  /**
   * Re-embed rows stored under foreign dimensions with the active model.
   * @param dims - active model dimensions (rows with other dims are migrated).
   * @param embed - async embedder used for every stale row body.
   * @param onProgress - called after each row (done, total).
   * @param isCancelled - checked between rows; stops the loop when true.
   */
  async reEmbedAll(
    dims: number,
    embed: (text: string) => Promise<Float32Array>,
    onProgress: (done: number, total: number) => void,
    isCancelled: () => boolean,
  ): Promise<void> {
    const rows = this.#stale.all(dims) as unknown as Array<{ id: string; content: string }>
    for (let index = 0; index < rows.length; index += 1) {
      if (isCancelled()) return
      const row = rows[index]
      const embedding = await embed(row.content)
      this.#updateEmbedding.run(embedding, dims, Date.now(), row.id)
      onProgress(index + 1, rows.length)
    }
  }

  /** Delete one memory by id. */
  forget(id: string): boolean {
    const result = this.#deleteId.run(id)
    return result.changes > 0
  }

  /** Enable or disable one memory; disabled rows stay stored but leave search and dedup. */
  setEnabled(id: string, enabled: boolean): boolean {
    const result = this.#setEnabled.run(enabled ? 1 : 0, Date.now(), id)
    return result.changes > 0
  }

  /** Pin or unpin one memory; pinned rules are always injected into the prompt. */
  setPinned(id: string, pinned: boolean): boolean {
    const result = this.#db.prepare('UPDATE memories SET pinned = ?, updated_at = ? WHERE id = ?').run(pinned ? 1 : 0, Date.now(), id)
    return result.changes > 0
  }

  /**
   * Enabled pinned rules for one project context, oldest first (stable order).
   * Pure row read — no embedding needed, so it also works while the model is
   * cold. Global rules apply everywhere; project rules apply to their project.
   * @param project - canonical project key, or null for global-only context.
   * @param limit - max rules to return.
   */
  pinnedRules(project: string | null, limit: number): Array<{ id: string; content: string; tags: string; scope: MemoryScope; pinned: boolean; createdAt: number }> {
    const where = project === null
      ? { sql: "pinned = 1 AND enabled = 1 AND scope = 'global'", params: [] as SQLInputValue[] }
      : { sql: "pinned = 1 AND enabled = 1 AND (scope = 'global' OR (scope = 'project' AND project = ?))", params: [project] as SQLInputValue[] }
    const rows = this.#db.prepare(
      `SELECT id, content, tags, scope, project, pinned, created_at FROM memories WHERE ${where.sql} ORDER BY created_at ASC LIMIT ?`,
    ).all(...where.params, limit) as unknown as Array<{
      id: string
      content: string
      tags: string
      scope: MemoryScope
      pinned: number
      created_at: number
    }>
    return rows.map((row) => ({ id: row.id, content: row.content, tags: row.tags, scope: row.scope, pinned: row.pinned === 1, createdAt: row.created_at }))
  }

  /** Paginated full listing with scope filter and date ordering. */
  listAll(
    scope: 'all' | MemoryScope,
    project: string | null,
    sort: 'createdAtDesc' | 'createdAtAsc',
    offset: number,
    limit: number,
  ): { items: Array<{ id: string; content: string; tags: string; scope: MemoryScope; dims: number; enabled: boolean; pinned: boolean; useCount: number; createdAt: number }>; total: number } {
    const order = sort === 'createdAtAsc' ? 'ASC' : 'DESC'
    const where = scope === 'all'
      ? { sql: '1 = 1', params: [] as SQLInputValue[] }
      : scope === 'global'
        ? { sql: 'scope = ?', params: ['global'] as SQLInputValue[] }
        : { sql: '(scope = ? AND project = ?) OR scope = ?', params: [scope, project, 'global'] as SQLInputValue[] }
    const total = Number((this.#db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE ${where.sql}`).get(...where.params) as { n: number }).n)
    const items = this.#db.prepare(
      `SELECT id, content, tags, scope, dims, enabled, pinned, use_count, created_at FROM memories WHERE ${where.sql} ORDER BY created_at ${order} LIMIT ? OFFSET ?`,
    ).all(...where.params, limit, offset) as unknown as Array<{
      id: string
      content: string
      tags: string
      scope: MemoryScope
      dims: number
      enabled: number
      pinned: number
      use_count: number
      created_at: number
    }>
    return {
      items: items.map((row) => ({ id: row.id, content: row.content, tags: row.tags, scope: row.scope, dims: row.dims, enabled: row.enabled === 1, pinned: row.pinned === 1, useCount: row.use_count, createdAt: row.created_at })),
      total,
    }
  }

  /** Counts by scope axis for the stats header. */
  countsByScope(): { project: number; global: number } {
    const rows = this.#db.prepare('SELECT scope, COUNT(*) AS n FROM memories GROUP BY scope').all() as unknown as Array<{ scope: string; n: number }>
    let project = 0
    let global = 0
    for (const row of rows) {
      if (row.scope === 'global') global = row.n
      else project += row.n
    }
    return { project, global }
  }

  /** Recent memories of one scope axis, newest first. */
  list(scope: MemoryScope, project: string | null, limit: number): MemListRow[] {
    const rows = this.#recent.all() as unknown as Array<{
      id: string
      content: string
      tags: string
      scope: MemoryScope
      project: string | null
      created_at: number
    }>
    const filtered = scope === 'global'
      ? rows
      : rows.filter((row) => row.scope === 'global' || (row.scope === 'project' && row.project === project))
    return filtered.slice(0, limit).map((row) => ({
      id: row.id,
      content: row.content,
      tags: row.tags,
      scope: row.scope,
      createdAt: row.created_at,
    }))
  }

  close(): void {
    this.#db.close()
  }
}

/** Row shape returned by {@link MemoryStore.list}. */
export interface MemListRow {
  id: string
  content: string
  tags: string
  scope: MemoryScope
  createdAt: number
}
