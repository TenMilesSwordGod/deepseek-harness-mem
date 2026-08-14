/**
 * Memory widget: a top-right header chip (state dot + count) that opens a
 * panel with status, semantic quick search, and a manual record box. Live
 * activity arrives through the 'memory' session projection and animates the
 * chip plus a transient toast; embedding warmup progress is polled from the
 * host status Remote.
 * @module @deepseek-ai/dsh-client-ui-mem
 */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { MemStatus } from '@deepseek-ai/dsh-mem/client';
/** Mutation verbs injected from the plugin apply closure. */
export interface MemActions {
    status(): Promise<RemoteResult<MemStatus>>;
    models(): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemModelsResponse>>;
    configure(model: string): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemConfigureResponse>>;
    search(query: string, limit: number): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemSearchResponse>>;
    record(content: string): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemRecordResponse>>;
    forget(id: string): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemForgetResponse>>;
}
/** Full composed props: session standard kit + injected verbs + locale seat. */
export type MemWidgetProps = PropsRuntime<'conversation.session.header.utilities'> & MemActions & PropsLocale<'mem'>;
/**
 * Header widget body. Pure presentation: everything arrives through the
 * four props shares (session kit, injected verbs, locale).
 * @param props - composed widget props.
 * @returns the chip, optional toast, and optional open panel.
 */
export declare function MemWidget({ useProjection, t, status, models, configure, search, record, forget, }: MemWidgetProps): JSX.Element;
