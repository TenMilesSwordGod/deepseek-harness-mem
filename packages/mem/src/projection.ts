/**
 * Session projection fold for the memory widget: the latest memory tool call
 * and per-kind call counts, derived from `tool/call` events only.
 * @module @deepseek-ai/simplemem
 */

import { z as zod } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { MemProjection, MemoryActivity } from './types.ts'

/** Wire validator for the folded value (the projection registry schema). */
export const memProjectionSchema = zod.object({
  last: zod.union([
    zod.object({
      kind: zod.enum(['record', 'search', 'forget']),
      text: zod.string(),
      at: zod.number(),
    }),
    zod.null(),
  ]),
  counts: zod.object({
    record: zod.number(),
    search: zod.number(),
  }),
})

/** Map one tool name to its activity kind; null for foreign tools. */
function kindOf(toolName: string): MemoryActivity['kind'] | null {
  if (toolName === 'simplemem_record') return 'record'
  if (toolName === 'simplemem_search') return 'search'
  if (toolName === 'simplemem_forget') return 'forget'
  return null
}

/** Extract a display snippet from the model's raw arguments JSON. */
function snippetOf(rawArgs: string): string {
  try {
    const args = JSON.parse(rawArgs) as Record<string, unknown>
    if (typeof args['content'] === 'string' && args['content'] !== '') return args['content']
    if (typeof args['query'] === 'string' && args['query'] !== '') return args['query']
  } catch {
    // Unparsable model JSON: fall through to the empty snippet.
  }
  return ''
}

/** Empty-log state. */
export function initMemFold(): MemProjection {
  return { last: null, counts: { record: 0, search: 0 } }
}

/**
 * Pure transition over one committed session event.
 * @param state - state covering all prior events.
 * @param event - the next committed event.
 * @returns the same reference for foreign events; a fresh value otherwise.
 */
export function applyMemFold(state: MemProjection, event: SessionEvent): MemProjection {
  if (event.type !== 'tool/call') return state
  const kind = kindOf(event.data.name)
  if (kind === null) return state
  const next: MemProjection = {
    // `event.time` is the event's real wall-clock time, so a session reload
    // (which replays the log and refolds) does NOT stamp the activity as
    // having just happened — the widget can tell live activity from history.
    last: { kind, text: snippetOf(event.data.arguments).slice(0, 140), at: event.time },
    counts: { ...state.counts },
  }
  if (kind === 'record') next.counts.record += 1
  if (kind === 'search') next.counts.search += 1
  return next
}
