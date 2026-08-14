/**
 * Schemastery Config for the memory service, with deployment defaults.
 * @module @deepseek-ai/dsh-mem
 */
import z from '@deepseek-ai/schemastery';
import type { MemConfig, ResolvedMemConfig } from './types.ts';
/** Model the default embedding backend mirrors opencode-mem's default. */
export declare const DEFAULT_EMBEDDING_MODEL = "Xenova/nomic-embed-text-v1";
/** nomic-embed-text-v1 dimension count. */
export declare const DEFAULT_EMBEDDING_DIMENSIONS = 768;
/** Loader-facing Config schema; partial input is normalized in {@link resolveConfig}. */
export declare const Config: z<Schemastery.ObjectS<{
    dbPath: z<string, string>;
    embeddingModel: z<string, string>;
    embeddingDimensions: z<number, number>;
    embeddingTaskPrefixes: z<boolean, boolean>;
    modelCacheDir: z<string, string>;
    warmupOnBoot: z<boolean, boolean>;
    recordDedupThreshold: z<number, number>;
    searchMinSimilarity: z<number, number>;
    searchLimit: z<number, number>;
    maxRecordChars: z<number, number>;
    activityRingSize: z<number, number>;
}>, Schemastery.ObjectT<{
    dbPath: z<string, string>;
    embeddingModel: z<string, string>;
    embeddingDimensions: z<number, number>;
    embeddingTaskPrefixes: z<boolean, boolean>;
    modelCacheDir: z<string, string>;
    warmupOnBoot: z<boolean, boolean>;
    recordDedupThreshold: z<number, number>;
    searchMinSimilarity: z<number, number>;
    searchLimit: z<number, number>;
    maxRecordChars: z<number, number>;
    activityRingSize: z<number, number>;
}>>;
/**
 * Materialize deployment defaults for one partial config.
 * @param config - partial loader config (validated by the schema above).
 * @returns complete resolved config with absolute paths.
 */
export declare function resolveConfig(config: Partial<MemConfig>): ResolvedMemConfig;
