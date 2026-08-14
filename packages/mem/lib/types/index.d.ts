/**
 * The memory service (`ctx.memory`): SQLite-backed semantic memory with
 * model-facing tools, a Typert Remote face for the browser widget, and a
 * session projection that drives the widget's activity animation.
 *
 * Referenced prior art: opencode-mem (local embeddings, record/search tools,
 * per-project scoping); this port keeps that shape on node:sqlite and the
 * DeepSeek Harness plugin seams.
 * @module @deepseek-ai/dsh-mem
 */
import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { EmbeddingService } from './embedding.js';
import { MemoryStore } from './store.js';
import type { MemConfig, MemConfigureRequest, MemConfigureResponse, MemForgetRequest, MemForgetResponse, MemListRequest, MemListResponse, MemModelsResponse, MemRecordRequest, MemRecordResponse, MemSearchRequest, MemSearchResponse, MemStatus, ResolvedMemConfig } from './types.ts';
/**
 * Persistent semantic memory service. Loader row id `mem`; the browser widget
 * talks to it through the `memory` Remote namespace.
 */
export declare class MemService extends TypertRemoteService {
    #private;
    static inject: string[];
    static Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        dbPath: import("@deepseek-ai/schemastery").default<string, string>;
        embeddingModel: import("@deepseek-ai/schemastery").default<string, string>;
        embeddingDimensions: import("@deepseek-ai/schemastery").default<number, number>;
        embeddingTaskPrefixes: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        modelCacheDir: import("@deepseek-ai/schemastery").default<string, string>;
        warmupOnBoot: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        recordDedupThreshold: import("@deepseek-ai/schemastery").default<number, number>;
        searchMinSimilarity: import("@deepseek-ai/schemastery").default<number, number>;
        searchLimit: import("@deepseek-ai/schemastery").default<number, number>;
        maxRecordChars: import("@deepseek-ai/schemastery").default<number, number>;
        activityRingSize: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        dbPath: import("@deepseek-ai/schemastery").default<string, string>;
        embeddingModel: import("@deepseek-ai/schemastery").default<string, string>;
        embeddingDimensions: import("@deepseek-ai/schemastery").default<number, number>;
        embeddingTaskPrefixes: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        modelCacheDir: import("@deepseek-ai/schemastery").default<string, string>;
        warmupOnBoot: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        recordDedupThreshold: import("@deepseek-ai/schemastery").default<number, number>;
        searchMinSimilarity: import("@deepseek-ai/schemastery").default<number, number>;
        searchLimit: import("@deepseek-ai/schemastery").default<number, number>;
        maxRecordChars: import("@deepseek-ai/schemastery").default<number, number>;
        activityRingSize: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    readonly config: ResolvedMemConfig;
    readonly store: MemoryStore;
    readonly embedding: EmbeddingService;
    /** TS-private on purpose: @Remote methods run with the cordis proxy as
     *  `this`, which cannot read ECMAScript #private members. */
    private readonly activityRing;
    private reembedState;
    private reembedVersion;
    constructor(ctx: Context, config?: Partial<MemConfig>);
    /** Append one activity to the ring and return the new head. */
    private pushActivity;
    /** Whole status snapshot for the widget header. */
    status(): MemStatus;
    /** Catalog plus local-cache flags, and the active model. */
    models(): MemModelsResponse;
    /**
     * Switch the active embedding model; a dimension change starts a background
     * re-embed of stored rows. Persisted in the SQLite meta table so the choice
     * survives restarts and wins over the cordis config default.
     */
    configure(request: MemConfigureRequest): Promise<MemConfigureResponse>;
    /**
     * Background re-embed task: every row stored under foreign dimensions is
     * re-embedded with the active model. A newer configure cancels the loop.
     * @param model - model id this task belongs to (stale tasks stop early).
     */
    private startReembed;
    /** Quick search from the widget; the agent's session supplies the project key. */
    search(agent: Agent, request: MemSearchRequest): Promise<MemSearchResponse>;
    /** Manual record from the widget. */
    record(agent: Agent, request: MemRecordRequest): Promise<MemRecordResponse>;
    /** Recent memories for the widget panel. */
    list(agent: Agent, request: MemListRequest): MemListResponse;
    /** Delete one memory from the widget panel. */
    forget(request: MemForgetRequest): MemForgetResponse;
}
export default MemService;
