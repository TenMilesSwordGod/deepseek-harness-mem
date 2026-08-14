/**
 * Memory widget plugin, browser half: mounts the hand-written `memory`
 * Remote contribution and registers the header-utilities entry. Live
 * activity arrives through the 'memory' session projection; the inject face
 * carries only the remote verbs.
 * @module @deepseek-ai/dsh-client-ui-mem
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the client ctx.remote merge and TypertClientRemote typing.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merge (the header utilities entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the 'memory' SessionProjectionMap key merge.
import type {} from '@deepseek-ai/dsh-mem/client'
import { memoryRemote } from './remote.ts'
import type { MemoryRemoteNamespace } from './remote.ts'
import { MemWidget } from './MemWidget.tsx'
import type { MemActions } from './MemWidget.tsx'
import { memStyles } from './styles.ts'
import { en, zh } from './locales.ts'
import type { MemKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The memory widget's copy. */
    mem: MemKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'mem'

/**
 * Required services: slot machinery, sessions, the Remote gateway, locale.
 * The `memory` namespace is NOT injected here: this plugin mounts it itself,
 * and a self-inject would deadlock the fiber before apply runs.
 */
export const inject = ['slots', 'sessions', 'remote', 'locale']

// Stylesheet injection at bundle evaluation; the module loader claims the
// <style> element per plugin id so reloads dispose it with the bundle.
const styleElement = document.createElement('style')
styleElement.textContent = memStyles
document.head.appendChild(styleElement)

/**
 * Client plugin body: mount the memory Remote face and register the widget.
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-mem: dictionaries')

  const disposeRemote = await ctx.remote.$mount(memoryRemote)
  ctx.effect(() => disposeRemote, 'ui-mem: remote unmount')

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'mem',
    order: 0,
    locale: NS,
    inject: (sessionId: SessionId): MemActions => {
      // Global store read: the namespace service is mounted by THIS plugin,
      // so declaring it in `inject` would deadlock the fiber before apply.
      const memory = ctx.get('remote.memory') as MemoryRemoteNamespace
      return {
        status: () => memory.status(),
        models: () => memory.models(),
        configure: (model) => memory.configure({ model }),
        search: (query, limit) => memory.search(sessionId, { query, limit }),
        record: (content) => memory.record(sessionId, { content }),
        forget: (id) => memory.forget({ id }),
      }
    },
  }, MemWidget))
}
