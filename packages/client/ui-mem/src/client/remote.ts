/**
 * Hand-written Typert Remote contribution for the memory namespace: the same
 * face model the repo generator emits, authored here because this plugin
 * lives outside the monorepo build. Mirrors @deepseek-ai/simplemem's Remote
 * methods (status / search / record / list / forget).
 * @module @deepseek-ai/dsh-client-ui-simplemem
 */

import { z } from 'zod'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  MemCacheStats,
  MemCancelDownloadResponse,
  MemConfigureRequest,
  MemConfigureResponse,
  MemConsolidateAnalyzeRequest,
  MemConsolidateAnalyzeResponse,
  MemConsolidateApplyRequest,
  MemConsolidateApplyResponse,
  MemDownloadRequest,
  MemDownloadResponse,
  MemForgetRequest,
  MemForgetResponse,
  MemListAllRequest,
  MemListAllResponse,
  MemListRequest,
  MemListResponse,
  MemModelsResponse,
  MemRecordRequest,
  MemRecordResponse,
  MemReembedResponse,
  MemSearchRequest,
  MemSearchResponse,
  MemSetEnabledRequest,
  MemSetEnabledResponse,
  MemSetPinnedRequest,
  MemSetPinnedResponse,
  MemStatus,
  MemWarmupResponse,
} from '@deepseek-ai/dsh-simplemem/client'

const sessionIdCodec = { mode: 'strict' as const, typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', schema: z.intersection(z.string(), z.unknown()) }

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
    state: z.enum(['idle', 'loading', 'ready', 'error']),
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
  pinned: z.boolean().optional(),
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
    pinned: z.boolean(),
    // Optional: older hosts do not send it yet; the UI defaults to 0.
    useCount: z.number().optional(),
    createdAt: z.number(),
  })),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

const memSetEnabledRequestSchema = z.object({ id: z.string(), enabled: z.boolean() })

const memSetEnabledResponseSchema = z.object({ id: z.string(), enabled: z.boolean(), updated: z.boolean() })

const memSetPinnedRequestSchema = z.object({ id: z.string(), pinned: z.boolean() })

const memSetPinnedResponseSchema = z.object({ id: z.string(), pinned: z.boolean(), updated: z.boolean() })

const memAgentModelResponseSchema = z.object({
  provider: z.string(),
  model: z.string(),
}).nullable()

const memConsolidateChangeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('merge'), sourceIds: z.array(z.string()).min(1), content: z.string(), tags: z.string(), reason: z.string() }),
  z.object({ type: z.literal('rewrite'), id: z.string(), content: z.string(), tags: z.string(), reason: z.string() }),
  z.object({ type: z.literal('retag'), id: z.string(), tags: z.string(), reason: z.string() }),
  z.object({ type: z.literal('delete'), id: z.string(), reason: z.string() }),
])

const memConsolidateAnalyzeRequestSchema = z.object({
  ids: z.array(z.string()),
  model: z.object({ provider: z.string(), model: z.string() }).optional(),
})

const memConsolidateAnalyzeResponseSchema = z.object({
  plan: z.object({
    summary: z.string(),
    changes: z.array(memConsolidateChangeSchema),
  }),
  rows: z.array(z.object({
    id: z.string(),
    content: z.string(),
    tags: z.string(),
    scope: z.enum(['project', 'global']),
    useCount: z.number(),
    createdAt: z.number(),
    pinned: z.boolean(),
  })),
  usedModel: z.object({ provider: z.string(), model: z.string() }).nullable(),
})

const memConsolidateApplyRequestSchema = z.object({
  plan: z.object({
    summary: z.string(),
    changes: z.array(memConsolidateChangeSchema),
  }),
})

const memConsolidateApplyResponseSchema = z.object({
  applied: z.array(z.object({
    kind: z.enum(['merged', 'rewritten', 'retagged', 'deleted']),
    id: z.string().optional(),
    detail: z.string(),
  })),
  count: z.number(),
})

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

const codec = (typeSymbol: string, schema: z.ZodType): { mode: 'strict'; typeSymbol: string; schema: z.ZodType } => ({
  mode: 'strict',
  typeSymbol,
  schema,
})

const jsonParam = (name: string, wire: string, typeSymbol: string, schema: z.ZodType, acceptsUndefined = false) => ({
  name,
  wire,
  source: 'json' as const,
  codec: codec(typeSymbol, schema),
  ...(acceptsUndefined ? { acceptsUndefined: true as const } : {}),
})

/** Agent lookup parameter: the client binder supplies the wire identity
 *  (agent and session share one id; the strict host registry requires the
 *  lookup key to equal the scope context). */
const sessionParam = {
  name: 'agent',
  wire: 'agentId',
  source: 'lookup' as const,
  lookup: 'agent',
  codec: sessionIdCodec,
}

/** The memory namespace consumer-side contract, mounted by this plugin. */
export const memoryRemote: TypertRemoteContribution = {
  package: '@deepseek-ai/dsh-simplemem',
  descriptors: [
    {
      id: '@deepseek-ai/dsh-simplemem#memory/status',
      service: 'memory',
      namespace: 'memory',
      method: 'status',
      invocation: { kind: 'direct' },
      parameters: [],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemStatus', memStatusSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/search',
      service: 'memory',
      namespace: 'memory',
      method: 'search',
      invocation: { kind: 'direct' },
      scope: { context: 'agent', wire: 'agentId' },
      parameters: [
        sessionParam,
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemSearchRequest', memSearchRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemSearchResponse', memSearchResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/record',
      service: 'memory',
      namespace: 'memory',
      method: 'record',
      invocation: { kind: 'direct' },
      scope: { context: 'agent', wire: 'agentId' },
      parameters: [
        sessionParam,
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemRecordRequest', memRecordRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemRecordResponse', memRecordResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/list',
      service: 'memory',
      namespace: 'memory',
      method: 'list',
      invocation: { kind: 'direct' },
      scope: { context: 'agent', wire: 'agentId' },
      parameters: [
        sessionParam,
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemListRequest', memListRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemListResponse', memListResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/models',
      service: 'memory',
      namespace: 'memory',
      method: 'models',
      invocation: { kind: 'direct' },
      parameters: [],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemModelsResponse', memModelsResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/configure',
      service: 'memory',
      namespace: 'memory',
      method: 'configure',
      invocation: { kind: 'direct' },
      parameters: [
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemConfigureRequest', memConfigureRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemConfigureResponse', memConfigureResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/reembed',
      service: 'memory',
      namespace: 'memory',
      method: 'reembed',
      invocation: { kind: 'direct' },
      parameters: [],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemReembedResponse', memReembedResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/downloadModel',
      service: 'memory',
      namespace: 'memory',
      method: 'downloadModel',
      invocation: { kind: 'direct' },
      parameters: [
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemDownloadRequest', memDownloadRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemDownloadResponse', memDownloadResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/cancelDownload',
      service: 'memory',
      namespace: 'memory',
      method: 'cancelDownload',
      invocation: { kind: 'direct' },
      parameters: [],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemCancelDownloadResponse', memCancelDownloadResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/warmup',
      service: 'memory',
      namespace: 'memory',
      method: 'warmup',
      invocation: { kind: 'direct' },
      parameters: [],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemWarmupResponse', memWarmupResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/setEnabled',
      service: 'memory',
      namespace: 'memory',
      method: 'setEnabled',
      invocation: { kind: 'direct' },
      parameters: [
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemSetEnabledRequest', memSetEnabledRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemSetEnabledResponse', memSetEnabledResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/setPinned',
      service: 'memory',
      namespace: 'memory',
      method: 'setPinned',
      invocation: { kind: 'direct' },
      parameters: [
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemSetPinnedRequest', memSetPinnedRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemSetPinnedResponse', memSetPinnedResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/agentModel',
      service: 'memory',
      namespace: 'memory',
      method: 'agentModel',
      invocation: { kind: 'direct' },
      scope: { context: 'agent', wire: 'agentId' },
      parameters: [
        sessionParam,
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemAgentModelResponse', memAgentModelResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/consolidateAnalyze',
      service: 'memory',
      namespace: 'memory',
      method: 'consolidateAnalyze',
      invocation: { kind: 'direct' },
      scope: { context: 'agent', wire: 'agentId' },
      parameters: [
        sessionParam,
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemConsolidateAnalyzeRequest', memConsolidateAnalyzeRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemConsolidateAnalyzeResponse', memConsolidateAnalyzeResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/consolidateApply',
      service: 'memory',
      namespace: 'memory',
      method: 'consolidateApply',
      invocation: { kind: 'direct' },
      parameters: [
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemConsolidateApplyRequest', memConsolidateApplyRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemConsolidateApplyResponse', memConsolidateApplyResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/cacheStats',
      service: 'memory',
      namespace: 'memory',
      method: 'cacheStats',
      invocation: { kind: 'direct' },
      parameters: [],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemCacheStats', memCacheStatsSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/listAll',
      service: 'memory',
      namespace: 'memory',
      method: 'listAll',
      invocation: { kind: 'direct' },
      scope: { context: 'agent', wire: 'agentId' },
      parameters: [
        sessionParam,
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemListAllRequest', memListAllRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemListAllResponse', memListAllResponseSchema),
    },
    {
      id: '@deepseek-ai/dsh-simplemem#memory/forget',
      service: 'memory',
      namespace: 'memory',
      method: 'forget',
      invocation: { kind: 'direct' },
      parameters: [
        jsonParam('request', 'request', '@deepseek-ai/dsh-simplemem/client#MemForgetRequest', memForgetRequestSchema),
      ],
      result: codec('@deepseek-ai/dsh-simplemem/client#MemForgetResponse', memForgetResponseSchema),
    },
  ],
}

/** Namespace surface the widget reads through the mounted Remote service. */
export interface MemoryRemoteNamespace {
  status(): Promise<RemoteResult<MemStatus>>
  warmup(): Promise<RemoteResult<MemWarmupResponse>>
  reembed(): Promise<RemoteResult<MemReembedResponse>>
  downloadModel(request: MemDownloadRequest): Promise<RemoteResult<MemDownloadResponse>>
  cancelDownload(): Promise<RemoteResult<MemCancelDownloadResponse>>
  models(): Promise<RemoteResult<MemModelsResponse>>
  configure(request: MemConfigureRequest): Promise<RemoteResult<MemConfigureResponse>>
  cacheStats(): Promise<RemoteResult<MemCacheStats>>
  listAll(sessionId: SessionId, request: MemListAllRequest): Promise<RemoteResult<MemListAllResponse>>
  setEnabled(request: MemSetEnabledRequest): Promise<RemoteResult<MemSetEnabledResponse>>
  setPinned(request: MemSetPinnedRequest): Promise<RemoteResult<MemSetPinnedResponse>>
  agentModel(sessionId: SessionId): Promise<RemoteResult<{ provider: string; model: string } | null>>
  consolidateAnalyze(sessionId: SessionId, request: MemConsolidateAnalyzeRequest): Promise<RemoteResult<MemConsolidateAnalyzeResponse>>
  consolidateApply(request: MemConsolidateApplyRequest): Promise<RemoteResult<MemConsolidateApplyResponse>>
  search(sessionId: SessionId, request: MemSearchRequest): Promise<RemoteResult<MemSearchResponse>>
  record(sessionId: SessionId, request: MemRecordRequest): Promise<RemoteResult<MemRecordResponse>>
  list(sessionId: SessionId, request: MemListRequest): Promise<RemoteResult<MemListResponse>>
  forget(request: MemForgetRequest): Promise<RemoteResult<MemForgetResponse>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    memory: MemoryRemoteNamespace
  }
}
