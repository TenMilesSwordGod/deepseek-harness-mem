/**
 * Session projection fold for the memory widget: the latest memory tool call
 * and per-kind call counts, derived from `tool/call` events only.
 * @module @deepseek-ai/dsh-mem
 */
import { z as zod } from 'zod';
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
});
/** Map one tool name to its activity kind; null for foreign tools. */
function kindOf(toolName) {
    if (toolName === 'mem_record')
        return 'record';
    if (toolName === 'mem_search')
        return 'search';
    if (toolName === 'mem_forget')
        return 'forget';
    return null;
}
/** Extract a display snippet from the model's raw arguments JSON. */
function snippetOf(rawArgs) {
    try {
        const args = JSON.parse(rawArgs);
        if (typeof args['content'] === 'string' && args['content'] !== '')
            return args['content'];
        if (typeof args['query'] === 'string' && args['query'] !== '')
            return args['query'];
    }
    catch {
        // Unparsable model JSON: fall through to the empty snippet.
    }
    return '';
}
/** Empty-log state. */
export function initMemFold() {
    return { last: null, counts: { record: 0, search: 0 } };
}
/**
 * Pure transition over one committed session event.
 * @param state - state covering all prior events.
 * @param event - the next committed event.
 * @returns the same reference for foreign events; a fresh value otherwise.
 */
export function applyMemFold(state, event) {
    if (event.type !== 'tool/call')
        return state;
    const kind = kindOf(event.data.name);
    if (kind === null)
        return state;
    const next = {
        last: { kind, text: snippetOf(event.data.arguments).slice(0, 140), at: Date.now() },
        counts: { ...state.counts },
    };
    if (kind === 'record')
        next.counts.record += 1;
    if (kind === 'search')
        next.counts.search += 1;
    return next;
}
