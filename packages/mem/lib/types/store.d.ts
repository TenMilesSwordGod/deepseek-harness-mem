/**
 * SQLite-backed memory store on node:sqlite. Embeddings are stored as raw
 * float32 LE blobs; similarity is a cosine over candidates loaded per scope,
 * which keeps the store dependency-free and fast for small memory corpora.
 * @module @deepseek-ai/dsh-mem
 */
import type { MemoryScope, MemHit } from './types.ts';
/** Scope filter fragment for one (scope, project) pair. */
/**
 * SQLite memory store: schema, record-with-dedup, cosine search, and stats.
 * All statements are prepared once; writes go through synchronous calls.
 */
export declare class MemoryStore {
    #private;
    readonly dbPath: string;
    constructor(dbPath: string);
    /** Read one persisted meta value by key. */
    metaGet(key: string): string | null;
    /** Persist one meta value by key (upsert). */
    metaSet(key: string, value: string): void;
    /** Total row count across every scope. */
    count(): number;
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
    record(content: string, tags: string, scope: MemoryScope, project: string | null, sessionId: string | null, embedding: Float32Array, dims: number, dedupThreshold: number): {
        status: 'recorded' | 'deduplicated';
        id: string;
        similarity?: number;
    };
    /**
     * Ranked cosine search over one scope axis.
     * @param embedding - query vector.
     * @param scope - 'project' or 'global'.
     * @param project - canonical project key for project scope, else null.
     * @param limit - result cap.
     * @param minSimilarity - drop hits below this similarity.
     * @returns hits ordered by descending similarity.
     */
    search(embedding: Float32Array, scope: MemoryScope, project: string | null, dims: number, limit: number, minSimilarity: number): MemHit[];
    /** Rows whose embedding dimensions differ from the active model. */
    staleCount(dims: number): number;
    /**
     * Re-embed rows stored under foreign dimensions with the active model.
     * @param dims - active model dimensions (rows with other dims are migrated).
     * @param embed - async embedder used for every stale row body.
     * @param onProgress - called after each row (done, total).
     * @param isCancelled - checked between rows; stops the loop when true.
     */
    reEmbedAll(dims: number, embed: (text: string) => Promise<Float32Array>, onProgress: (done: number, total: number) => void, isCancelled: () => boolean): Promise<void>;
    /** Delete one memory by id. */
    forget(id: string): boolean;
    /** Recent memories of one scope axis, newest first. */
    list(scope: MemoryScope, project: string | null, limit: number): MemListRow[];
    close(): void;
}
/** Row shape returned by {@link MemoryStore.list}. */
export interface MemListRow {
    id: string;
    content: string;
    tags: string;
    scope: MemoryScope;
    createdAt: number;
}
