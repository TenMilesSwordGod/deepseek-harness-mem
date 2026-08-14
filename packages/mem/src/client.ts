/**
 * Client-side type outlet for the memory domain: the widget imports these
 * types from `@deepseek-ai/dsh-mem/client`. Type-only module — the runtime
 * artifact is empty and never reaches the browser graph.
 * @module @deepseek-ai/dsh-mem/client
 */

export type {
  MemCacheStats,
  MemCacheTopEntry,
  MemConfig,
  MemConfigureRequest,
  MemConfigureResponse,
  MemForgetRequest,
  MemForgetResponse,
  MemHit,
  MemListAllItem,
  MemListAllRequest,
  MemListAllResponse,
  MemListRequest,
  MemListResponse,
  MemModelEntry,
  MemModelsResponse,
  MemProjection,
  MemRecordRequest,
  MemRecordResponse,

  MemSearchRequest,
  MemSearchResponse,
  MemStatus,
  MemoryActivity,
  MemoryActivityKind,
  MemoryScope,
  ReembedState,
  WarmupState,
} from './types.ts'
