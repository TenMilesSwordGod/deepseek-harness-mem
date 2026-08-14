/**
 * Local embedding backend on @huggingface/transformers, mirroring
 * opencode-mem's default: a feature-extraction pipeline over the configured
 * model with nomic task prefixes, mean pooling, and L2 normalization. The
 * pipeline is lazy (first use or warmupOnBoot) and reports download progress.
 * @module @deepseek-ai/dsh-mem
 */

import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { DownloadState, MemCacheStats, WarmupState } from './types.ts'
import { catalogModel } from './models.js'

/** Per-convention task prefixes applied when enabled. */
const TASK_PREFIXES = {
  nomic: { document: 'search_document: ', query: 'search_query: ' },
  e5: { document: 'passage: ', query: 'query: ' },
  none: { document: '', query: '' },
} as const

export type EmbedTask = 'document' | 'query'

/** Shape of the transformers pipeline we need (kept loose: loaded lazily). */
type FeatureExtractionPipe = (text: string, options: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>

/** Progress callback payload from transformers.js downloads. */
interface TransformersProgress {
  status?: 'progress' | string
  file?: string
  progress?: number
}

interface WarmupListener {
  (state: WarmupState): void
}

const CACHE_LIMIT = 128

/**
 * Owns the transformers.js pipeline for one process: lazy init, download
 * progress reporting, task prefixes, and a small LRU cache. A single instance
 * lives inside the memory service; nothing here is shared across plugins.
 */
export class EmbeddingService {
  #model: string
  #dimensions: number
  readonly #cacheDir: string
  readonly #useTaskPrefixes: boolean
  #pipe: FeatureExtractionPipe | null = null
  #initPromise: Promise<void> | null = null
  #warmup: WarmupState = { state: 'idle', progress: 0, detail: null }
  #listeners = new Set<WarmupListener>()
  readonly #cache = new Map<string, Float32Array>()
  readonly #cacheHits = new Map<string, { hits: number; lastAt: number }>()
  #hits = 0
  #misses = 0
  #download: DownloadState | null = null
  #downloadVersion = 0

  constructor(model: string, dimensions: number, cacheDir: string, useTaskPrefixes: boolean) {
    this.#model = model
    this.#dimensions = dimensions
    this.#cacheDir = cacheDir
    this.#useTaskPrefixes = useTaskPrefixes
  }

  /** Active model id. */
  get model(): string {
    return this.#model
  }

  /** Active embedding dimensions. */
  get dimensions(): number {
    return this.#dimensions
  }

  /** Current warmup snapshot (the service copies it into status()). */
  get warmupState(): WarmupState {
    return { ...this.#warmup }
  }

  /**
   * Switch to another model: resets pipeline, cache, and warmup state so the
   * next embed() loads the new model from the local cache (or downloads it).
   * @param model - new Hugging Face model id.
   * @param dimensions - dimensions the new model emits.
   */
  switchModel(model: string, dimensions: number): void {
    if (model === this.#model && dimensions === this.#dimensions) return
    this.#model = model
    this.#dimensions = dimensions
    this.#pipe = null
    this.#cache.clear()
    this.#cacheHits.clear()
    this.#hits = 0
    this.#misses = 0
    this.#setWarmup({ state: 'idle', progress: 0, detail: null })
  }

  /** Current manual-download task snapshot, or null when idle. */
  get downloadState(): DownloadState | null {
    return this.#download === null ? null : { ...this.#download }
  }

  /**
   * Download one catalog model's files into the local cache layout
   * (`<cacheDir>/<model-id>/...`) without touching the active pipeline.
   * @param modelId - catalog model id.
   * @returns true when the task started; false when a download is already running.
   */
  startDownload(modelId: string): boolean {
    if (this.#download?.state === 'running') return false
    const version = ++this.#downloadVersion
    this.#download = { model: modelId, state: 'running', progress: 0, detail: null }
    void this.#runDownload(modelId, version)
    return true
  }

  async #runDownload(modelId: string, version: number): Promise<void> {
    const set = (patch: Partial<DownloadState>): void => {
      if (this.#downloadVersion !== version) return
      this.#download = { ...(this.#download as DownloadState), ...patch }
    }
    try {
      const listResponse = await fetch(`https://huggingface.co/api/models/${modelId}`)
      if (!listResponse.ok) throw new Error(`model listing failed: HTTP ${listResponse.status}`)
      const payload = await listResponse.json() as { siblings?: Array<{ rfilename: string }> }
      const names = new Set((payload.siblings ?? []).map((entry) => entry.rfilename))
      const wanted: string[] = []
      for (const file of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt']) {
        if (names.has(file)) wanted.push(file)
      }
      const onnx = names.has('onnx/model_quantized.onnx') ? 'onnx/model_quantized.onnx' : 'onnx/model.onnx'
      wanted.push(onnx)
      let done = 0
      for (const file of wanted) {
        set({ detail: file })
        const response = await fetch(`https://huggingface.co/${modelId}/resolve/main/${file}`)
        if (!response.ok) throw new Error(`download of ${file} failed: HTTP ${response.status}`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const target = join(this.#cacheDir, modelId, file)
        mkdirSync(dirname(target), { recursive: true })
        await writeFile(target, bytes)
        done += 1
        set({ progress: done / wanted.length })
      }
      set({ state: 'done', progress: 1, detail: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ state: 'error', detail: message })
    }
  }

  /**
   * Embedding cache statistics with a top-hit ranking (text truncated).
   * @param topLimit - ranking size.
   * @returns live counters plus the ranked entries.
   */
  cacheStats(topLimit = 20): MemCacheStats {
    const top = [...this.#cacheHits.entries()]
      .map(([text, entry]) => ({ text: text.slice(0, 80), hits: entry.hits, lastAt: entry.lastAt }))
      .sort((a, b) => b.hits - a.hits || b.lastAt - a.lastAt)
      .slice(0, topLimit)
    return {
      hits: this.#hits,
      misses: this.#misses,
      size: this.#cache.size,
      capacity: CACHE_LIMIT,
      top,
    }
  }

  /** Whether the active model's files exist in the local model cache. */
  isCached(): boolean {
    return existsSync(join(this.#cacheDir, this.#model))
  }

  /**
   * Whether one catalog model's files exist in the local model cache.
   * @param modelId - Hugging Face model id.
   */
  isCachedFor(modelId: string): boolean {
    return existsSync(join(this.#cacheDir, modelId))
  }

  /** Subscribe to warmup-state changes. @returns the unsubscriber. */
  onWarmup(listener: WarmupListener): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  #setWarmup(patch: Partial<WarmupState>): void {
    this.#warmup = { ...this.#warmup, ...patch }
    for (const listener of this.#listeners) listener(this.#warmup)
  }

  /** True once one embedding request succeeded. */
  get ready(): boolean {
    return this.#warmup.state === 'ready'
  }

  /**
   * Initialize the pipeline; concurrent calls share one in-flight init.
   * @returns resolution when the model answered its first probe.
   */
  async warmup(): Promise<void> {
    if (this.#warmup.state === 'ready') return
    if (this.#warmup.state === 'error') throw new Error(this.#warmup.detail ?? 'embedding warmup failed')
    if (this.#initPromise !== null) return this.#initPromise
    this.#initPromise = this.#initialize()
    try {
      await this.#initPromise
    } finally {
      this.#initPromise = null
    }
  }

  async #initialize(): Promise<void> {
    this.#setWarmup({ state: 'downloading', progress: 0, detail: null })
    try {
      const transformers = await import('@huggingface/transformers')
      const { pipeline, env } = transformers as {
        pipeline: (task: 'feature-extraction', model: string, options: Record<string, unknown>) => Promise<FeatureExtractionPipe>
        env: Record<string, unknown> & { allowLocalModels: boolean; allowRemoteModels: boolean; cacheDir?: string; localModelPath?: string; dtype?: string }
      }
      env.allowLocalModels = true
      const localModelDir = join(this.#cacheDir, this.#model)
      if (existsSync(localModelDir)) {
        env.localModelPath = this.#cacheDir
        env.allowRemoteModels = false
      } else {
        env.cacheDir = this.#cacheDir
        env.allowRemoteModels = true
      }
      const onProgress = (payload: TransformersProgress): void => {
        if (payload.status === 'progress' && typeof payload.progress === 'number') {
          const progress = Math.min(1, payload.progress / 100)
          this.#setWarmup({ state: 'downloading', progress, detail: payload.file ?? null })
        }
      }
      this.#pipe = await pipeline('feature-extraction', this.#model, {
        dtype: 'q8',
        progress_callback: onProgress,
      })
      // Probe with a minimal input so `ready` only ever means "answered once".
      const probe = await this.#embed('ready probe', 'query')
      if (probe.length !== this.#dimensions) {
        throw new Error(`embedding dimension mismatch: model returned ${probe.length}, expected ${this.#dimensions}`)
      }
      this.#setWarmup({ state: 'ready', progress: 1, detail: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.#setWarmup({ state: 'error', detail: message })
      throw new Error(message)
    }
  }

  #embed(text: string, task: EmbedTask): Promise<Float32Array> {
    if (this.#pipe === null) {
      throw new Error('embedding pipeline is not initialized')
    }
    const kind = catalogModel(this.#model)?.taskPrefixes ?? 'nomic'
    const input = this.#useTaskPrefixes ? `${TASK_PREFIXES[kind][task]}${text}` : text
    const cached = this.#cache.get(input)
    if (cached !== undefined) {
      this.#hits += 1
      const hit = this.#cacheHits.get(input)
      const now = Date.now()
      if (hit === undefined) this.#cacheHits.set(input, { hits: 1, lastAt: now })
      else {
        hit.hits += 1
        hit.lastAt = now
      }
      return Promise.resolve(cached)
    }
    this.#misses += 1
    return this.#pipe(input, { pooling: 'mean', normalize: true }).then((output) => {
      const vector = output.data
      if (this.#cache.size >= CACHE_LIMIT) {
        const oldest = this.#cache.keys().next().value
        if (oldest !== undefined) this.#cache.delete(oldest)
      }
      this.#cache.set(input, vector)
      return vector
    })
  }

  /**
   * Embed one text with an implicit warmup.
   * @param text - text to embed.
   * @param task - document (memory body) or query (search text).
   * @returns the normalized float32 vector.
   */
  async embed(text: string, task: EmbedTask): Promise<Float32Array> {
    await this.warmup()
    return this.#embed(text, task)
  }
}
