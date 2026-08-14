/**
 * Memory widget plugin, browser half: mounts the hand-written `memory`
 * Remote contribution and registers the header-utilities entry. Live
 * activity arrives through the 'memory' session projection; the inject face
 * carries only the remote verbs.
 * @module @deepseek-ai/dsh-client-ui-mem
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { MemKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The memory widget's copy. */
        mem: MemKey;
    }
}
/**
 * Required services: slot machinery, sessions, the Remote gateway, locale.
 * The `memory` namespace is NOT injected here: this plugin mounts it itself,
 * and a self-inject would deadlock the fiber before apply runs.
 */
export declare const inject: string[];
/**
 * Client plugin body: mount the memory Remote face and register the widget.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): Promise<void>;
