/**
 * Hand-written Typert Remote contribution for the memory namespace: the same
 * face model the repo generator emits, authored here because this plugin
 * lives outside the monorepo build. Mirrors @deepseek-ai/dsh-mem's Remote
 * methods (status / search / record / list / forget).
 * @module @deepseek-ai/dsh-client-ui-mem
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { MemConfigureRequest, MemConfigureResponse, MemForgetRequest, MemForgetResponse, MemListRequest, MemListResponse, MemModelsResponse, MemRecordRequest, MemRecordResponse, MemSearchRequest, MemSearchResponse, MemStatus } from '@deepseek-ai/dsh-mem/client';
/** The memory namespace consumer-side contract, mounted by this plugin. */
export declare const memoryRemote: TypertRemoteContribution;
/** Namespace surface the widget reads through the mounted Remote service. */
export interface MemoryRemoteNamespace {
    status(): Promise<RemoteResult<MemStatus>>;
    models(): Promise<RemoteResult<MemModelsResponse>>;
    configure(request: MemConfigureRequest): Promise<RemoteResult<MemConfigureResponse>>;
    search(sessionId: SessionId, request: MemSearchRequest): Promise<RemoteResult<MemSearchResponse>>;
    record(sessionId: SessionId, request: MemRecordRequest): Promise<RemoteResult<MemRecordResponse>>;
    list(sessionId: SessionId, request: MemListRequest): Promise<RemoteResult<MemListResponse>>;
    forget(request: MemForgetRequest): Promise<RemoteResult<MemForgetResponse>>;
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespaceMap {
        memory: MemoryRemoteNamespace;
    }
}
