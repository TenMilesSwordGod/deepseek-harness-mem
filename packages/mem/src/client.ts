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
  MemDownloadRequest,
  MemDownloadResponse,
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
  MemReembedResponse,

  MemSearchRequest,
  MemSearchResponse,
  MemSetEnabledRequest,
  MemSetEnabledResponse,
  MemStatus,
  MemWarmupResponse,
  MemoryActivity,
  MemoryActivityKind,
  MemoryScope,
  ReembedState,
  WarmupState,
  DownloadState,
} from './types.ts'
