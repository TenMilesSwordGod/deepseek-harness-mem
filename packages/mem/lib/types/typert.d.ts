/**
 * Host-side Typert face for the memory service: hand-written wire schemas
 * registered into `ctx.typert` (the sanctioned path for contributions
 * without a generated `./typert` artifact). Registration makes the gateway
 * claim and dispatch `memory/*` endpoints through the strict registry
 * instead of the source-marker fallback, so endpoint claims survive service
 * hot-reloads without depending on the gateway's cached source claims.
 * @module @deepseek-ai/dsh-mem
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types';
/** Host-face contribution registered through `ctx.typert.register`. */
export declare const MEMORY_TYPERT_HOST: TypertContribution;
