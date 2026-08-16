/**
 * Memory consolidation: LLM-driven cleanup of selected memories. The model
 * receives the rows (content, tags, scope, retrieval usage) and returns a
 * structured plan (merge / rewrite / retag / delete). The plan is validated
 * here, rendered for human review in the widget, and only executed when the
 * user confirms. Pure helpers are exported for offline smoke testing.
 * @module @deepseek-ai/simplemem
 */

import { z } from 'zod'
import type { MemoryStore } from './store.js'
import type {
  ConsolidateApplyItem,
  ConsolidateChange,
  ConsolidatePlan,
  ConsolidateRow,
} from './types.ts'

/** Normalize a comma-separated tag string into lowercase storage form. */
function normalizeTags(raw: string): string {
  return raw
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag !== '')
    .slice(0, 12)
    .join(',')
}

/**
 * Build the model-facing instructions for one consolidation pass.
 * @param rows - selected memories (protected pinned rows included, marked).
 * @param minUseCount - at-or-below this usage count ⇒ suggest delete.
 * @param highUseCount - at-or-above this usage count ⇒ suggest narrower tags.
 * @returns the system prompt text.
 */
export function buildConsolidatePrompt(rows: ConsolidateRow[], minUseCount: number, highUseCount: number): string {
  const block = rows.map((row, index) => [
    `[${index}] id=${row.id}`,
    `content: ${row.content}`,
    `tags: ${row.tags === '' ? '(none)' : row.tags}`,
    `scope: ${row.scope}`,
    `useCount: ${row.useCount}`,
    row.pinned ? 'pinned: true — PROTECTED: never delete, merge, or rewrite this entry' : '',
  ].filter(Boolean).join('\n')).join('\n\n')

  return [
    'You are the memory curator for a coding agent. Clean up the selected memories below:',
    '1. DEDUPE: near-duplicate or heavily overlapping memories → merge them into one concise entry.',
    '2. PRUNE: memories whose useCount is at or below ' + String(minUseCount) + ' (rarely retrieved) and not valuable → delete.',
    '3. RETAG: memories whose useCount is at or above ' + String(highUseCount) + ' match too broadly (their tags are too wide) → give them narrower, more specific tags; if the memory itself is too broad, split it via rewrites.',
    '4. REWRITE: fix vague or stale wording while keeping the fact intact.',
    '5. NEVER touch entries marked pinned: true (they are protected user rules).',
    '',
    'Every change must reference real ids from the list. Keep the total information, do not invent facts.',
    '',
    'Memories:',
    block,
    '',
    'Respond with ONLY the raw JSON object — no markdown fences, no commentary, no reasoning, no trailing text. The response must start with "{" and end with "}". Schema:',
    JSON.stringify({
      summary: 'one-line summary of the pass',
      changes: [
        { type: 'merge', sourceIds: ['ids being merged'], content: 'the merged memory text', tags: 'comma separated', reason: 'why' },
        { type: 'rewrite', id: 'one id', content: 'rewritten text', tags: 'comma separated', reason: 'why' },
        { type: 'retag', id: 'one id', tags: 'narrower comma separated', reason: 'why' },
        { type: 'delete', id: 'one id', reason: 'why' },
      ],
    }, null, 2),
  ].join('\n')
}

const consolidateChangeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('merge'),
    sourceIds: z.array(z.string().min(1)).min(1),
    content: z.string().min(1),
    tags: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('rewrite'),
    id: z.string().min(1),
    content: z.string().min(1),
    tags: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('retag'),
    id: z.string().min(1),
    tags: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('delete'),
    id: z.string().min(1),
    reason: z.string(),
  }),
])

const consolidatePlanSchema = z.object({
  summary: z.string(),
  changes: z.array(consolidateChangeSchema),
})

/**
 * Parse the model's JSON plan, tolerating common wrapping:
 * markdown fences, a reasoning/commentary prefix (the object is extracted
 * from the first `{` to the last `}`), and trailing garbage.
 * @throws on invalid input.
 */
export function parseConsolidatePlan(text: string): ConsolidatePlan {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const candidates: string[] = [cleaned]
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last > first) {
    candidates.push(cleaned.slice(first, last + 1))
  }
  let payload: unknown
  let lastError: unknown
  for (const candidate of candidates) {
    try {
      payload = JSON.parse(candidate)
      break
    } catch (error) {
      lastError = error
    }
  }
  if (payload === undefined) {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 200)
    throw new Error(`consolidation returned non-JSON${preview === '' ? ' (empty response)' : `: ${preview}`} (${String(lastError)})`)
  }
  const result = consolidatePlanSchema.safeParse(payload)
  if (!result.success) {
    throw new Error(`consolidation plan failed validation: ${result.error.message.slice(0, 200)}`)
  }
  return result.data
}

/**
 * Execute a confirmed consolidation plan against the store.
 * Pinned memories are protected (skipped) even if the plan touches them.
 * @param store - the memory store.
 * @param plan - the user-confirmed plan.
 * @param deps - embedding + dimension context for creating/rewriting rows.
 * @returns per-change outcome list for the result view.
 */
export async function applyConsolidatePlan(
  store: MemoryStore,
  plan: ConsolidatePlan,
  deps: { embed: (text: string) => Promise<Float32Array>; dims: number; dedupThreshold: number },
): Promise<ConsolidateApplyItem[]> {
  const applied: Array<ConsolidateApplyItem | null> = []
  for (const change of plan.changes) {
    applied.push(await applyOne(store, change, deps))
  }
  return applied.filter((item): item is ConsolidateApplyItem => item !== null)
}

async function applyOne(
  store: MemoryStore,
  change: ConsolidateChange,
  deps: { embed: (text: string) => Promise<Float32Array>; dims: number; dedupThreshold: number },
): Promise<ConsolidateApplyItem | null> {
  if (change.type === 'merge') {
    const sources = store.getByIds(change.sourceIds)
    const usable = sources.filter((row) => !row.pinned)
    if (usable.length === 0) return null
    const first = usable[0]
    const embedding = await deps.embed(change.content)
    const result = store.record(
      change.content,
      normalizeTags(change.tags),
      first.scope,
      first.project,
      null,
      embedding,
      deps.dims,
      deps.dedupThreshold,
      false,
    )
    const removed = usable.map((row) => row.id)
    for (const id of removed) store.forget(id)
    return {
      kind: 'merged',
      id: result.id,
      detail: `merged ${usable.length} ${usable.length > 1 ? 'memories' : 'memory'} (${removed.map((id) => id.slice(0, 8)).join(', ')}) → ${result.id.slice(0, 8)}`,
    }
  }
  if (change.type === 'rewrite') {
    const row = store.getByIds([change.id])[0]
    if (row === undefined || row.pinned) return null
    const embedding = await deps.embed(change.content)
    store.rewrite(change.id, change.content, normalizeTags(change.tags), embedding, deps.dims)
    return { kind: 'rewritten', id: change.id, detail: `rewritten: ${change.content.slice(0, 60)}` }
  }
  if (change.type === 'retag') {
    const row = store.getByIds([change.id])[0]
    if (row === undefined || row.pinned) return null
    store.updateTags(change.id, normalizeTags(change.tags))
    return { kind: 'retagged', id: change.id, detail: `tags: ${row.tags === '' ? '(none)' : row.tags} → ${change.tags === '' ? '(none)' : change.tags}` }
  }
  // delete
  const row = store.getByIds([change.id])[0]
  if (row === undefined || row.pinned) return null
  store.forget(change.id)
  return { kind: 'deleted', id: change.id, detail: `removed: ${row.content.slice(0, 60)}` }
}
