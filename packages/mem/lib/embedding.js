/**
 * Local embedding backend on @huggingface/transformers, mirroring
 * opencode-mem's default: a feature-extraction pipeline over the configured
 * model with nomic task prefixes, mean pooling, and L2 normalization. The
 * pipeline is lazy (first use or warmupOnBoot) and reports download progress.
 * @module @deepseek-ai/dsh-mem
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { catalogModel } from './models.js';
/** Per-convention task prefixes applied when enabled. */
const TASK_PREFIXES = {
    nomic: { document: 'search_document: ', query: 'search_query: ' },
    e5: { document: 'passage: ', query: 'query: ' },
    none: { document: '', query: '' },
};
const CACHE_LIMIT = 128;
/**
 * Owns the transformers.js pipeline for one process: lazy init, download
 * progress reporting, task prefixes, and a small LRU cache. A single instance
 * lives inside the memory service; nothing here is shared across plugins.
 */
export class EmbeddingService {
    #model;
    #dimensions;
    #cacheDir;
    #useTaskPrefixes;
    #pipe = null;
    #initPromise = null;
    #warmup = { state: 'idle', progress: 0, detail: null };
    #listeners = new Set();
    #cache = new Map();
    constructor(model, dimensions, cacheDir, useTaskPrefixes) {
        this.#model = model;
        this.#dimensions = dimensions;
        this.#cacheDir = cacheDir;
        this.#useTaskPrefixes = useTaskPrefixes;
    }
    /** Active model id. */
    get model() {
        return this.#model;
    }
    /** Active embedding dimensions. */
    get dimensions() {
        return this.#dimensions;
    }
    /** Current warmup snapshot (the service copies it into status()). */
    get warmupState() {
        return { ...this.#warmup };
    }
    /**
     * Switch to another model: resets pipeline, cache, and warmup state so the
     * next embed() loads the new model from the local cache (or downloads it).
     * @param model - new Hugging Face model id.
     * @param dimensions - dimensions the new model emits.
     */
    switchModel(model, dimensions) {
        if (model === this.#model && dimensions === this.#dimensions)
            return;
        this.#model = model;
        this.#dimensions = dimensions;
        this.#pipe = null;
        this.#cache.clear();
        this.#setWarmup({ state: 'idle', progress: 0, detail: null });
    }
    /** Whether the active model's files exist in the local model cache. */
    isCached() {
        return existsSync(join(this.#cacheDir, this.#model));
    }
    /**
     * Whether one catalog model's files exist in the local model cache.
     * @param modelId - Hugging Face model id.
     */
    isCachedFor(modelId) {
        return existsSync(join(this.#cacheDir, modelId));
    }
    /** Subscribe to warmup-state changes. @returns the unsubscriber. */
    onWarmup(listener) {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }
    #setWarmup(patch) {
        this.#warmup = { ...this.#warmup, ...patch };
        for (const listener of this.#listeners)
            listener(this.#warmup);
    }
    /** True once one embedding request succeeded. */
    get ready() {
        return this.#warmup.state === 'ready';
    }
    /**
     * Initialize the pipeline; concurrent calls share one in-flight init.
     * @returns resolution when the model answered its first probe.
     */
    async warmup() {
        if (this.#warmup.state === 'ready')
            return;
        if (this.#warmup.state === 'error')
            throw new Error(this.#warmup.detail ?? 'embedding warmup failed');
        if (this.#initPromise !== null)
            return this.#initPromise;
        this.#initPromise = this.#initialize();
        try {
            await this.#initPromise;
        }
        finally {
            this.#initPromise = null;
        }
    }
    async #initialize() {
        this.#setWarmup({ state: 'downloading', progress: 0, detail: null });
        try {
            const transformers = await import('@huggingface/transformers');
            const { pipeline, env } = transformers;
            env.allowLocalModels = true;
            const localModelDir = join(this.#cacheDir, this.#model);
            if (existsSync(localModelDir)) {
                env.localModelPath = this.#cacheDir;
                env.allowRemoteModels = false;
            }
            else {
                env.cacheDir = this.#cacheDir;
                env.allowRemoteModels = true;
            }
            const onProgress = (payload) => {
                if (payload.status === 'progress' && typeof payload.progress === 'number') {
                    const progress = Math.min(1, payload.progress / 100);
                    this.#setWarmup({ state: 'downloading', progress, detail: payload.file ?? null });
                }
            };
            this.#pipe = await pipeline('feature-extraction', this.#model, {
                dtype: 'q8',
                progress_callback: onProgress,
            });
            // Probe with a minimal input so `ready` only ever means "answered once".
            const probe = await this.#embed('ready probe', 'query');
            if (probe.length !== this.#dimensions) {
                throw new Error(`embedding dimension mismatch: model returned ${probe.length}, expected ${this.#dimensions}`);
            }
            this.#setWarmup({ state: 'ready', progress: 1, detail: null });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.#setWarmup({ state: 'error', detail: message });
            throw new Error(message);
        }
    }
    #embed(text, task) {
        if (this.#pipe === null) {
            throw new Error('embedding pipeline is not initialized');
        }
        const kind = catalogModel(this.#model)?.taskPrefixes ?? 'nomic';
        const input = this.#useTaskPrefixes ? `${TASK_PREFIXES[kind][task]}${text}` : text;
        const cached = this.#cache.get(input);
        if (cached !== undefined)
            return Promise.resolve(cached);
        return this.#pipe(input, { pooling: 'mean', normalize: true }).then((output) => {
            const vector = output.data;
            if (this.#cache.size >= CACHE_LIMIT) {
                const oldest = this.#cache.keys().next().value;
                if (oldest !== undefined)
                    this.#cache.delete(oldest);
            }
            this.#cache.set(input, vector);
            return vector;
        });
    }
    /**
     * Embed one text with an implicit warmup.
     * @param text - text to embed.
     * @param task - document (memory body) or query (search text).
     * @returns the normalized float32 vector.
     */
    async embed(text, task) {
        await this.warmup();
        return this.#embed(text, task);
    }
}
