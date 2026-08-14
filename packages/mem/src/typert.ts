/**
 * Host-side Typert face for the memory service: hand-written wire schemas
 * registered into `ctx.typert` (the sanctioned path for contributions
 * without a generated `./typert` artifact). Registration makes the gateway
 * claim and dispatch `memory/*` endpoints through the strict registry
 * instead of the source-marker fallback, so endpoint claims survive service
 * hot-reloads without depending on the gateway's cached source claims.
 * @module @deepseek-ai/dsh-mem
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
    id: '@deepseek-ai/dsh-mem#memory/status',
    service: 'memory',
    namespace: 'memory',
    method: 'status',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('@deepseek-ai/dsh-mem/client#MemStatus', memStatusSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/models',
    service: 'memory',
    namespace: 'memory',
    method: 'models',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('@deepseek-ai/dsh-mem/client#MemModelsResponse', memModelsResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/configure',
    service: 'memory',
    namespace: 'memory',
    method: 'configure',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('request', 'request', '@deepseek-ai/dsh-mem/client#MemConfigureRequest', memConfigureRequestSchema),
    ],
    result: codec('@deepseek-ai/dsh-mem/client#MemConfigureResponse', memConfigureResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/search',
    service: 'memory',
    namespace: 'memory',
    method: 'search',
    invocation: { kind: 'direct' },
    scope: { context: 'agent', wire: 'agentId' },
    parameters: [
      agentParam,
      jsonParam('request', 'request', '@deepseek-ai/dsh-mem/client#MemSearchRequest', memSearchRequestSchema),
    ],
    result: codec('@deepseek-ai/dsh-mem/client#MemSearchResponse', memSearchResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/record',
    service: 'memory',
    namespace: 'memory',
    method: 'record',
    invocation: { kind: 'direct' },
    scope: { context: 'agent', wire: 'agentId' },
    parameters: [
      agentParam,
      jsonParam('request', 'request', '@deepseek-ai/dsh-mem/client#MemRecordRequest', memRecordRequestSchema),
    ],
    result: codec('@deepseek-ai/dsh-mem/client#MemRecordResponse', memRecordResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/list',
    service: 'memory',
    namespace: 'memory',
    method: 'list',
    invocation: { kind: 'direct' },
    scope: { context: 'agent', wire: 'agentId' },
    parameters: [
      agentParam,
      jsonParam('request', 'request', '@deepseek-ai/dsh-mem/client#MemListRequest', memListRequestSchema),
    ],
    result: codec('@deepseek-ai/dsh-mem/client#MemListResponse', memListResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/reembed',
    service: 'memory',
    namespace: 'memory',
    method: 'reembed',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('@deepseek-ai/dsh-mem/client#MemReembedResponse', memReembedResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/downloadModel',
    service: 'memory',
    namespace: 'memory',
    method: 'downloadModel',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('request', 'request', '@deepseek-ai/dsh-mem/client#MemDownloadRequest', memDownloadRequestSchema),
    ],
    result: codec('@deepseek-ai/dsh-mem/client#MemDownloadResponse', memDownloadResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/warmup',
    service: 'memory',
    namespace: 'memory',
    method: 'warmup',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('@deepseek-ai/dsh-mem/client#MemWarmupResponse', memWarmupResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/setEnabled',
    service: 'memory',
    namespace: 'memory',
    method: 'setEnabled',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('request', 'request', '@deepseek-ai/dsh-mem/client#MemSetEnabledRequest', memSetEnabledRequestSchema),
    ],
    result: codec('@deepseek-ai/dsh-mem/client#MemSetEnabledResponse', memSetEnabledResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/cacheStats',
    service: 'memory',
    namespace: 'memory',
    method: 'cacheStats',
    invocation: { kind: 'direct' },
    parameters: [],
    result: codec('@deepseek-ai/dsh-mem/client#MemCacheStats', memCacheStatsSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/listAll',
    service: 'memory',
    namespace: 'memory',
    method: 'listAll',
    invocation: { kind: 'direct' },
    scope: { context: 'agent', wire: 'agentId' },
    parameters: [
      agentParam,
      jsonParam('request', 'request', '@deepseek-ai/dsh-mem/client#MemListAllRequest', memListAllRequestSchema),
    ],
    result: codec('@deepseek-ai/dsh-mem/client#MemListAllResponse', memListAllResponseSchema),
  },
  {
    id: '@deepseek-ai/dsh-mem#memory/forget',
    service: 'memory',
    namespace: 'memory',
    method: 'forget',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('request', 'request', '@deepseek-ai/dsh-mem/client#MemForgetRequest', memForgetRequestSchema),
    ],
    result: codec('@deepseek-ai/dsh-mem/client#MemForgetResponse', memForgetResponseSchema),
  },
]

/** Host-face contribution registered through `ctx.typert.register`. */
export const MEMORY_TYPERT_HOST: TypertContribution = {
  package: '@deepseek-ai/dsh-mem',
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations,
}
