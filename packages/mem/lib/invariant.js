/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-mem`.
 * External deployments do not run the harness invariant registry over
 * profile plugins, so the companion only re-exports the package identity.
 * @module @deepseek-ai/dsh-mem/invariant
 */
/** Package the companion owns. */
export const name = 'mem-invariant';
/** No runtime invariant: the service owns one store and one pipeline. */
export function apply() { }
