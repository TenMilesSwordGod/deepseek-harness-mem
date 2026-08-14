/**
 * Local embedding backend on @huggingface/transformers, mirroring
 * opencode-mem's default: a feature-extraction pipeline over the configured
 * model with nomic task prefixes, mean pooling, and L2 normalization. The
 * pipeline is lazy (first use or warmupOnBoot) and reports download progress.
 * @module @deepseek-ai/dsh-mem
 */
import type { WarmupState } from './types.ts';
export type EmbedTask = 'document' | 'query';
interface WarmupListener {
    (state: WarmupState): void;
}
/**
 * Owns the transformers.js pipeline for one process: lazy init, download
 * progress reporting, task prefixes, and a small LRU cache. A single instance
 * lives inside the memory service; nothing here is shared across plugins.
 */
export declare class EmbeddingService {
    #private;
    constructor(model: string, dimensions: number, cacheDir: string, useTaskPrefixes: boolean);
    /** Active model id. */
    get model(): string;
    /** Active embedding dimensions. */
    get dimensions(): number;
    /** Current warmup snapshot (the service copies it into status()). */
    get warmupState(): WarmupState;
    /**
     * Switch to another model: resets pipeline, cache, and warmup state so the
     * next embed() loads the new model from the local cache (or downloads it).
     * @param model - new Hugging Face model id.
     * @param dimensions - dimensions the new model emits.
     */
    switchModel(model: string, dimensions: number): void;
    /** Whether the active model's files exist in the local model cache. */
    isCached(): boolean;
    /**
     * Whether one catalog model's files exist in the local model cache.
     * @param modelId - Hugging Face model id.
     */
    isCachedFor(modelId: string): boolean;
    /** Subscribe to warmup-state changes. @returns the unsubscriber. */
    onWarmup(listener: WarmupListener): () => void;
    /** True once one embedding request succeeded. */
    get ready(): boolean;
    /**
     * Initialize the pipeline; concurrent calls share one in-flight init.
     * @returns resolution when the model answered its first probe.
     */
    warmup(): Promise<void>;
    /**
     * Embed one text with an implicit warmup.
     * @param text - text to embed.
     * @param task - document (memory body) or query (search text).
     * @returns the normalized float32 vector.
     */
    embed(text: string, task: EmbedTask): Promise<Float32Array>;
}
export {};
