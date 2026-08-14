/**
 * Built-in embedding model catalog: small ONNX models that infer on CPU,
 * mirroring opencode-mem's local-model menu. Dimensions are fixed per model;
 * switching models with different dimensions triggers a background re-embed.
 * @module @deepseek-ai/dsh-mem
 */
/** Which task-prefix convention a model expects before embedding. */
export type MemTaskPrefixKind = 'nomic' | 'e5' | 'none';
/** One selectable embedding model entry. */
export interface MemModelInfo {
    /** Hugging Face model id (also the local cache directory name). */
    id: string;
    /** Embedding dimension this model emits. */
    dims: number;
    /** Short display label. */
    label: string;
    /** One-line description shown in the widget. */
    desc: string;
    /** Approximate on-disk size in MB (informational). */
    sizeMb: number;
    /** Whether the model covers non-English text. */
    multilingual: boolean;
    /** Task-prefix convention the model was trained with. */
    taskPrefixes: MemTaskPrefixKind;
}
/** Default model: opencode-mem's default, balanced quality/size. */
export declare const DEFAULT_MEM_MODEL = "Xenova/nomic-embed-text-v1";
/**
 * Catalog ordered lightest-first. The two smallest entries are the
 * recommended CPU-friendly choices; the rest are selectable for quality.
 */
export declare const MEM_MODELS: readonly MemModelInfo[];
/**
 * Look up a catalog entry by model id.
 * @param id - Hugging Face model id.
 * @returns the entry, or undefined when the id is not in the catalog.
 */
export declare function catalogModel(id: string): MemModelInfo | undefined;
