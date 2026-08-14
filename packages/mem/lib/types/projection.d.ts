/**
 * Session projection fold for the memory widget: the latest memory tool call
 * and per-kind call counts, derived from `tool/call` events only.
 * @module @deepseek-ai/dsh-mem
 */
import { z as zod } from 'zod';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { MemProjection } from './types.ts';
/** Wire validator for the folded value (the projection registry schema). */
export declare const memProjectionSchema: zod.ZodObject<{
    last: zod.ZodUnion<readonly [zod.ZodObject<{
        kind: zod.ZodEnum<{
            record: "record";
            search: "search";
            forget: "forget";
        }>;
        text: zod.ZodString;
        at: zod.ZodNumber;
    }, zod.core.$strip>, zod.ZodNull]>;
    counts: zod.ZodObject<{
        record: zod.ZodNumber;
        search: zod.ZodNumber;
    }, zod.core.$strip>;
}, zod.core.$strip>;
/** Empty-log state. */
export declare function initMemFold(): MemProjection;
/**
 * Pure transition over one committed session event.
 * @param state - state covering all prior events.
 * @param event - the next committed event.
 * @returns the same reference for foreign events; a fresh value otherwise.
 */
export declare function applyMemFold(state: MemProjection, event: SessionEvent): MemProjection;
