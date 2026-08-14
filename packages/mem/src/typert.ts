/**
 * Host-side Typert face for the memory service: hand-written wire schemas
 * registered into `ctx.typert` (the sanctioned path for contributions
 * without a generated `./typert` artifact). Registration makes the gateway
 * claim and dispatch `memory/*` endpoints through the strict registry
 * instead of the source-marker fallback, so endpoint claims survive service
 * hot-reloads without depending on the gateway's cached source claims.
 * @module @deepseek-ai/simplemem
 */

import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'

const sessionIdCodec = {
  mode: 'strict' as const,
  typeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
  schema: z.intersection(z.string(), z.unknown()),
}

const memStatusSchema = z.object({
  ready: z.boolean(),
  model: z.string(),
  dimensions: z.number(),
  dbPath: z.string(),
  count: z.number(),
  staleCount: z.number(),
  lastActivity: z.union([
    z.object({ kind: z.enum(['record', 'search', 'forget']), text: z.string(), at: z.number() }),
    z.null(),
  ]),
  warmup: z.object({
    state: z.enum(['idle', 'downloading', 'ready', 'error']),
    progress: z.number(),
    detail: z.union([z.string(), z.null()]),
  }),
  reembed: z.union([
    z.object({ state: z.enum(['running', 'done']), done: z.number(), total: z.number() }),
    z.null(),
  ]),
  download: z.union([
    z.object({
      model: z.string(),
      state: z.enum(['running', 'done', 'error']),
      progress: z.number(),
      detail: z.union([z.string(), z.null()]),
    }),
    z.null(),
  ]),
})

const memModelsResponseSchema = z.object({
  catalog: z.array(z.object({
    id: z.string(),
    dims: z.number(),
    label: z.string(),
    desc: z.string(),
    sizeMb: z.number(),
    multilingual: z.boolean(),
    cached: z.boolean(),
  })),
  current: z.string(),
})

const memConfigureRequestSchema = z.object({ model: z.string() })

const memConfigureResponseSchema = z.object({
  model: z.string(),
  dimensions: z.number(),
  reembedding: z.boolean(),
  stale: z.number(),
})

const memReembedResponseSchema = z.object({ started: z.boolean(), stale: z.number() })

const memSearchRequestSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
  scope: z.enum(['project', 'global']).optional(),
  minSimilarity: z.number().optional(),
})

const memSearchResponseSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    content: z.string(),
    tags: z.string(),
    scope: z.enum(['project', 'global']),
    similarity: z.number(),
    createdAt: z.number(),
  })),
  scope: z.enum(['project', 'global']),
  project: z.union([z.string(), z.null()]),
})

const memRecordRequestSchema = z.object({
  content: z.string(),
  tags: z.string().optional(),
  scope: z.enum(['project', 'global']).optional(),
})

const memRecordResponseSchema = z.object({
  status: z.enum(['recorded', 'deduplicated']),
  id: z.string(),
  similarity: z.number().optional(),
  count: z.number(),
})

const memListRequestSchema = z.object({
  limit: z.number().optional(),
  scope: z.enum(['project', 'global']).optional(),
})

const memListResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    content: z.string(),
    tags: z.string(),
    scope: z.enum(['project', 'global']),
    createdAt: z.number(),
  })),
})

const memCacheStatsSchema = z.object({
  hits: z.number(),
  misses: z.number(),
  size: z.number(),
  capacity: z.number(),
  top: z.array(z.object({ text: z.string(), hits: z.number(), lastAt: z.number() })),
})

const memListAllRequestSchema = z.object({
  scope: z.enum(['all', 'project', 'global']).optional(),
  sort: z.enum(['createdAtDesc', 'createdAtAsc']).optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
})

const memListAllResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    content: z.string(),
    tags: z.string(),
    scope: z.enum(['project', 'global']),
    dims: z.number(),
    enabled: z.boolean(),
    createdAt: z.number(),
  })),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

const memSetEnabledRequestSchema = z.object({ id: z.string(), enabled: z.boolean() })

const memSetEnabledResponseSchema = z.object({ id: z.string(), enabled: z.boolean(), updated: z.boolean() })

const memWarmupResponseSchema = z.object({ ready: z.boolean() })

const memDownloadRequestSchema = z.object({ model: z.string() })

const memDownloadResponseSchema = z.object({
  started: z.boolean(),
  reason: z.string().optional(),
})

const memCancelDownloadResponseSchema = z.object({ cancelled: z.boolean() })

const memForgetRequestSchema = z.object({ id: z.string() })

const memForgetResponseSchema = z.object({
  forgotten: z.boolean(),
  count: z.number(),
})

/** Strict codec helper. */
function codec(typeSymbol: string, schema: z.ZodType): { mode: 'strict'; typeSymbol: string; schema: z.ZodType } {
  return { mode: 'strict', typeSymbol, schema }
}

/** JSON parameter helper. */
function jsonParam(name: string, wire: string, typeSymbol: string, schema: z.ZodType): InvocationDescriptor['parameters'][number] {
  return { name, wire, source: 'json', codec: codec(typeSymbol, schema) }
}

/** Agent lookup parameter; agent and session share one wire id, and the
 *  strict registry requires the lookup key to equal the scope context. */
const agentParam = {
  name: 'agent',
  wire: 'agentId',
  source: 'lookup' as const,
  lookup: 'agent',
  codec: sessionIdCodec,
}

/** Descriptors for every `@Remote` method of the memory service. */
const invocations: readonly InvocationDescriptor[] = [
  {
    id: 'simplemem#memory/status',
    service: 'memory',
    namespace: 'memory',
    method: 'status',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('simplemem/client#MemStatus', memStatusSchema),
  },
  {
    id: 'simplemem#memory/models',
    service: 'memory',
    namespace: 'memory',
    method: 'models',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('simplemem/client#MemModelsResponse', memModelsResponseSchema),
  },
  {
    id: 'simplemem#memory/configure',
    service: 'memory',
    namespace: 'memory',
    method: 'configure',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('request', 'request', 'simplemem/client#MemConfigureRequest', memConfigureRequestSchema),
    ],
    result: codec('simplemem/client#MemConfigureResponse', memConfigureResponseSchema),
  },
  {
    id: 'simplemem#memory/search',
    service: 'memory',
    namespace: 'memory',
    method: 'search',
    invocation: { kind: 'direct' },
    scope: { context: 'agent', wire: 'agentId' },
    parameters: [
      agentParam,
      jsonParam('request', 'request', 'simplemem/client#MemSearchRequest', memSearchRequestSchema),
    ],
    result: codec('simplemem/client#MemSearchResponse', memSearchResponseSchema),
  },
  {
    id: 'simplemem#memory/record',
    service: 'memory',
    namespace: 'memory',
    method: 'record',
    invocation: { kind: 'direct' },
    scope: { context: 'agent', wire: 'agentId' },
    parameters: [
      agentParam,
      jsonParam('request', 'request', 'simplemem/client#MemRecordRequest', memRecordRequestSchema),
    ],
    result: codec('simplemem/client#MemRecordResponse', memRecordResponseSchema),
  },
  {
    id: 'simplemem#memory/list',
    service: 'memory',
    namespace: 'memory',
    method: 'list',
    invocation: { kind: 'direct' },
    scope: { context: 'agent', wire: 'agentId' },
    parameters: [
      agentParam,
      jsonParam('request', 'request', 'simplemem/client#MemListRequest', memListRequestSchema),
    ],
    result: codec('simplemem/client#MemListResponse', memListResponseSchema),
  },
  {
    id: 'simplemem#memory/reembed',
    service: 'memory',
    namespace: 'memory',
    method: 'reembed',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('simplemem/client#MemReembedResponse', memReembedResponseSchema),
  },
  {
    id: 'simplemem#memory/downloadModel',
    service: 'memory',
    namespace: 'memory',
    method: 'downloadModel',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('request', 'request', 'simplemem/client#MemDownloadRequest', memDownloadRequestSchema),
    ],
    result: codec('simplemem/client#MemDownloadResponse', memDownloadResponseSchema),
  },
  {
    id: 'simplemem#memory/cancelDownload',
    service: 'memory',
    namespace: 'memory',
    method: 'cancelDownload',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('simplemem/client#MemCancelDownloadResponse', memCancelDownloadResponseSchema),
  },
  {
    id: 'simplemem#memory/warmup',
    service: 'memory',
    namespace: 'memory',
    method: 'warmup',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('simplemem/client#MemWarmupResponse', memWarmupResponseSchema),
  },
  {
    id: 'simplemem#memory/setEnabled',
    service: 'memory',
    namespace: 'memory',
    method: 'setEnabled',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('request', 'request', 'simplemem/client#MemSetEnabledRequest', memSetEnabledRequestSchema),
    ],
    result: codec('simplemem/client#MemSetEnabledResponse', memSetEnabledResponseSchema),
  },
  {
    id: 'simplemem#memory/cacheStats',
    service: 'memory',
    namespace: 'memory',
    method: 'cacheStats',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('simplemem/client#MemCacheStats', memCacheStatsSchema),
  },
  {
    id: 'simplemem#memory/listAll',
    service: 'memory',
    namespace: 'memory',
    method: 'listAll',
    invocation: { kind: 'direct' },
    scope: { context: 'agent', wire: 'agentId' },
    parameters: [
      agentParam,
      jsonParam('request', 'request', 'simplemem/client#MemListAllRequest', memListAllRequestSchema),
    ],
    result: codec('simplemem/client#MemListAllResponse', memListAllResponseSchema),
  },
  {
    id: 'simplemem#memory/forget',
    service: 'memory',
    namespace: 'memory',
    method: 'forget',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('request', 'request', 'simplemem/client#MemForgetRequest', memForgetRequestSchema),
    ],
    result: codec('simplemem/client#MemForgetResponse', memForgetResponseSchema),
  },
]

/** Host-face contribution registered through `ctx.typert.register`. */
export const MEMORY_TYPERT_HOST: TypertContribution = {
  package: 'simplemem',
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations,
}
