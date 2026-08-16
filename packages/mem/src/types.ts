/**
 * Wire and domain types for the memory service. Every value that crosses the
 * Typert wire is JSON-only; the projection value folds from session events.
 * @module @deepseek-ai/simplemem
 */

// Type-only: makes the SessionProjectionMap merge target resolvable.
import type {} from '@deepseek-ai/dsh-session-projection/types'

/** Memory scoping axis: one project (the session's cwd tree) or every project. */
export type MemoryScope = 'project' | 'global'

/** Discriminant for one memory activity, mirrored into the widget animation. */
export type MemoryActivityKind = 'record' | 'search' | 'forget'

/** One completed memory operation, kept in a host-side ring for the widget. */
export interface MemoryActivity {
  /** Operation kind. */
  kind: MemoryActivityKind
  /** Short human-readable snippet (recorded content or search query). */
  text: string
  /** Epoch milliseconds. */
  at: number
}

/** Embedding backend readiness. Local models only: 'loading' covers the
 *  on-disk pipeline load; downloads have their own {@link DownloadState}. */
export interface WarmupState {
  state: 'idle' | 'loading' | 'ready' | 'error'
  /** Error detail for display. */
  detail: string | null
}

/** Manual model-download task state (the widget's download button). */
export interface DownloadState {
  /** Model id being downloaded. */
  model: string
  state: 'running' | 'done' | 'error'
  /** Fraction 0..1. */
  progress: number
  /** Current file or error detail. */
  detail: string | null
}

/** Background re-embed progress after switching to a model with new dimensions. */
export interface ReembedState {
  state: 'running' | 'done'
  /** Rows already re-embedded. */
  done: number
  /** Total rows requiring re-embed when the task started. */
  total: number
}

/** Whole status snapshot for the browser widget. */
export interface MemStatus {
  /** True when the embedding pipeline answered one request. */
  ready: boolean
  /** Active embedding model id. */
  model: string
  /** Embedding dimension count of the active model. */
  dimensions: number
  /** SQLite database path. */
  dbPath: string
  /** Total stored memories across every scope. */
  count: number
  /** Rows whose stored dimensions differ from the active model (awaiting re-embed). */
  staleCount: number
  /** Most recent activity, or null when the store never ran. */
  lastActivity: MemoryActivity | null
  /** Warmup / download state of the embedding backend. */
  warmup: WarmupState
  /** In-flight re-embed task, or null when idle. */
  reembed: ReembedState | null
  /** Manual model download task, or null when idle. */
  download: DownloadState | null
}

/** One catalog entry as seen by the widget (adds the local-cache flag). */
export interface MemModelEntry {
  id: string
  dims: number
  label: string
  desc: string
  sizeMb: number
  multilingual: boolean
  /** True when the ONNX files already exist in the local model cache. */
  cached: boolean
}

/** models() Remote result. */
export interface MemModelsResponse {
  catalog: MemModelEntry[]
  current: string
}

/** configure() Remote request. */
export interface MemConfigureRequest {
  /** Catalog model id to switch to. */
  model: string
}

/** configure() Remote result. */
export interface MemConfigureResponse {
  model: string
  dimensions: number
  /** Legacy field, always false: re-embedding now waits for the user button. */
  reembedding: boolean
  /** Memories whose stored dimensions differ from the new model (awaiting the transform button). */
  stale: number
}

/** reembed() Remote result: explicitly transform stored memories to the active model. */
export interface MemReembedResponse {
  /** True when a re-embed task actually started. */
  started: boolean
  /** Stale rows remaining after the call (0 when none needed or already running). */
  stale: number
}

/** One ranked search hit. */
export interface MemHit {
  id: string
  content: string
  /** Comma-separated lowercase tags; '' when none. */
  tags: string
  /** 'project' or 'global'. */
  scope: MemoryScope
  /** Cosine similarity 0..1 against the query embedding. */
  similarity: number
  /** Epoch milliseconds. */
  createdAt: number
}

/** Quick-search request from the widget (search Remote). */
export interface MemSearchRequest {
  query: string
  /** Result cap; service default 10. */
  limit?: number
  /** Scoping axis; default 'project'. */
  scope?: MemoryScope
  /** Minimum similarity 0..1; default 0.3. */
  minSimilarity?: number
}

/** Search Remote result. */
export interface MemSearchResponse {
  results: MemHit[]
  /** Resolved scope used for the search. */
  scope: MemoryScope
  /** Project key used for 'project' scope; null when unscoped. */
  project: string | null
}

/** Manual record request from the widget (record Remote). */
export interface MemRecordRequest {
  content: string
  /** Optional comma-separated tags. */
  tags?: string
  /** Scoping axis; default 'project'. */
  scope?: MemoryScope
  /** Pin this memory: it is then always injected into the prompt, bypassing
   *  the similarity gate. Use for absolute rules the user stated. */
  pinned?: boolean
}

/** Record Remote result: either stored, or deduplicated against a near twin. */
export interface MemRecordResponse {
  /** 'recorded' when a row was inserted; 'deduplicated' when a twin exists. */
  status: 'recorded' | 'deduplicated'
  id: string
  /** Similarity of the matched twin when deduplicated. */
  similarity?: number
  /** Total memories after the operation. */
  count: number
}

/** Recent-list request from the widget (list Remote). */
export interface MemListRequest {
  /** Cap; default 20. */
  limit?: number
  /** Scoping axis; default 'project'. */
  scope?: MemoryScope
}

/** List Remote result. */
export interface MemListResponse {
  items: Array<{
    id: string
    content: string
    tags: string
    scope: MemoryScope
    createdAt: number
  }>
}

/** Forget Remote request/result pair. */
export interface MemForgetRequest {
  id: string
}

export interface MemForgetResponse {
  /** False when the id was unknown. */
  forgotten: boolean
  /** Total memories after the operation. */
  count: number
}

/** Per-session projection folded from memory tool calls (the widget's live feed). */
export interface MemProjection {
  /** Most recent memory tool call in this session, or null. */
  last: MemoryActivity | null
  /** Cumulative per-kind call counts for this session. */
  counts: { record: number; search: number }
}

/** Service Config (schemastery schema in config.ts mirrors these fields). */
export interface MemConfig {
  /** SQLite path; '' resolves to <dsh-home>/storages/mem.sqlite. */
  dbPath: string
  /** Hugging Face model id used for local embeddings. */
  embeddingModel: string
  /** Embedding dimension; must match the configured model. */
  embeddingDimensions: number
  /** Apply nomic task prefixes (search_document / search_query). */
  embeddingTaskPrefixes: boolean
  /** Local model directory; '' resolves to <dsh-home>/storages/mem-models. */
  modelCacheDir: string
  /** Warm the embedding pipeline at boot instead of first use. */
  warmupOnBoot: boolean
  /** Record dedup: similarity at or above this skips the insert. */
  recordDedupThreshold: number
  /** Search floor: hits below this similarity are dropped. */
  searchMinSimilarity: number
  /** Default search result cap. */
  searchLimit: number
  /** Hard cap on one recorded content string. */
  maxRecordChars: number
  /** Host-side activity ring size for the widget status. */
  activityRingSize: number
  /** Hugging Face base URL used by the manual downloader. */
  huggingfaceBaseUrl: string
  /** Inject top related memories into the prompt at each user turn. */
  autoInject: boolean
  /** Max memories injected per turn. */
  autoInjectCount: number
  /** Minimum similarity for auto-injected memories. */
  autoInjectThreshold: number
  /** Max pinned rules injected every turn; 0 disables pinned injection. */
  pinnedInjectCount: number
  /** Summarize completed turns and auto-record durable memories. */
  autoCapture: boolean
  /** Skip turns whose transcript is shorter than this. */
  autoCaptureMinChars: number
  /** Max memories recorded per auto-capture pass. */
  autoCaptureMaxMemories: number
  /** Max output tokens for the capture call. */
  autoCaptureMaxTokens: number
}

/** One entry in the embedding cache hit ranking. */
export interface MemCacheTopEntry {
  /** Truncated cache key text. */
  text: string
  /** Cache hits since the pipeline started. */
  hits: number
  /** Epoch milliseconds of the last hit. */
  lastAt: number
}

/** Embedding cache statistics for the stats modal. */
export interface MemCacheStats {
  /** Total cache hits. */
  hits: number
  /** Total cache misses (embedding runs). */
  misses: number
  /** Current cache entries. */
  size: number
  /** Cache capacity. */
  capacity: number
  /** Top entries by hit count, descending. */
  top: MemCacheTopEntry[]
}

/** One row of the all-memories list. */
export interface MemListAllItem {
  id: string
  content: string
  tags: string
  scope: MemoryScope
  dims: number
  /** False when the memory is disabled (excluded from search and dedup). */
  enabled: boolean
  /** True when pinned: the memory is always injected into the prompt. */
  pinned: boolean
  createdAt: number
}

/** Enable/disable request. */
export interface MemSetEnabledRequest {
  id: string
  enabled: boolean
}

/** Enable/disable result. */
export interface MemSetEnabledResponse {
  id: string
  enabled: boolean
  /** True when the row was found and updated. */
  updated: boolean
}

/** Pin/unpin request (pinned rules are always injected, no similarity gate). */
export interface MemSetPinnedRequest {
  id: string
  pinned: boolean
}

/** Pin/unpin result. */
export interface MemSetPinnedResponse {
  id: string
  pinned: boolean
  /** True when the row was found and updated. */
  updated: boolean
}

/** warmup() Remote result. */
export interface MemWarmupResponse {
  /** True when the embedding pipeline is warm. */
  ready: boolean
}

/** downloadModel() Remote request/result. */
export interface MemDownloadRequest {
  /** Catalog model id to download into the local cache. */
  model: string
}

export interface MemDownloadResponse {
  /** True when the download task started. */
  started: boolean
  /** Reason the task did not start (busy or unknown model). */
  reason?: string
}

/** cancelDownload() Remote result. */
export interface MemCancelDownloadResponse {
  /** True when a running download was cancelled. */
  cancelled: boolean
}

/** All-memories request: paginated, optional scope filter and date sort. */
export interface MemListAllRequest {
  /** 'all' | 'project' | 'global'. */
  scope?: 'all' | MemoryScope
  /** 'createdAtDesc' (default) or 'createdAtAsc'. */
  sort?: 'createdAtDesc' | 'createdAtAsc'
  /** 1-based page; default 1. */
  page?: number
  /** Rows per page; default 50, max 200. */
  pageSize?: number
}

/** All-memories response. */
export interface MemListAllResponse {
  items: MemListAllItem[]
  total: number
  page: number
  pageSize: number
}

/** Resolved defaults applied over partial Config. */
export type ResolvedMemConfig = Required<MemConfig>

/** Extensible context for one resolved memory operation. */
export interface MemoryOperationContext {
  /** Canonical project key (session cwd), or null for global. */
  project: string | null
  /** Owning session id when the call came from an agent. */
  sessionId: string | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Latest memory tool call plus per-kind counts for one session. */
    memory: MemProjection
  }
}
