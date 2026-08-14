/**
 * Schemastery Config for the memory service, with deployment defaults.
 * @module @deepseek-ai/dsh-mem
 */

import z from '@deepseek-ai/schemastery'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { MemConfig, ResolvedMemConfig } from './types.ts'

/** Model the default embedding backend mirrors opencode-mem's default. */
export const DEFAULT_EMBEDDING_MODEL = 'Xenova/nomic-embed-text-v1'
/** nomic-embed-text-v1 dimension count. */
export const DEFAULT_EMBEDDING_DIMENSIONS = 768

/** Loader-facing Config schema; partial input is normalized in {@link resolveConfig}. */
export const Config = z.object({
  dbPath: z.string().default(''),
  embeddingModel: z.string().default(DEFAULT_EMBEDDING_MODEL),
  embeddingDimensions: z.number().step(1).min(1).default(DEFAULT_EMBEDDING_DIMENSIONS),
  embeddingTaskPrefixes: z.boolean().default(true),
  modelCacheDir: z.string().default(''),
  warmupOnBoot: z.boolean().default(false),
  recordDedupThreshold: z.number().min(0).max(1).default(0.92),
  searchMinSimilarity: z.number().min(0).max(1).default(0.3),
  searchLimit: z.number().step(1).min(1).max(50).default(10),
  maxRecordChars: z.number().step(1).min(1).default(4000),
  activityRingSize: z.number().step(1).min(1).default(8),
  huggingfaceBaseUrl: z.string().default(''),
})

/**
 * Materialize deployment defaults for one partial config.
 * @param config - partial loader config (validated by the schema above).
 * @returns complete resolved config with absolute paths.
 */
export function resolveConfig(config: Partial<MemConfig>): ResolvedMemConfig {
  const dshHome = resolveDshHome()
  return {
    dbPath: config.dbPath !== undefined && config.dbPath !== ''
      ? config.dbPath
      : join(dshHome, 'storages', 'mem.sqlite'),
    embeddingModel: config.embeddingModel !== undefined && config.embeddingModel !== ''
      ? config.embeddingModel
      : DEFAULT_EMBEDDING_MODEL,
    embeddingDimensions: config.embeddingDimensions ?? DEFAULT_EMBEDDING_DIMENSIONS,
    embeddingTaskPrefixes: config.embeddingTaskPrefixes ?? true,
    modelCacheDir: config.modelCacheDir !== undefined && config.modelCacheDir !== ''
      ? config.modelCacheDir
      : join(dshHome, 'storages', 'mem-models'),
    warmupOnBoot: config.warmupOnBoot ?? false,
    recordDedupThreshold: config.recordDedupThreshold ?? 0.92,
    searchMinSimilarity: config.searchMinSimilarity ?? 0.3,
    searchLimit: config.searchLimit ?? 10,
    maxRecordChars: config.maxRecordChars ?? 4000,
    activityRingSize: config.activityRingSize ?? 8,
    huggingfaceBaseUrl: config.huggingfaceBaseUrl !== undefined && config.huggingfaceBaseUrl !== ''
      ? config.huggingfaceBaseUrl.replace(/\/+$/, '')
      : 'https://huggingface.co',
  }
}
