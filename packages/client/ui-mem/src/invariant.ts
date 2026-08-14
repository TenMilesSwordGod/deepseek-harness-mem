/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-simplemem`.
 * External deployments do not run the harness invariant registry over
 * profile plugins, so the companion only re-exports the package identity.
 * @module @deepseek-ai/dsh-client-ui-simplemem/invariant
 */

/** Package the companion owns. */
export const name = 'client-ui-mem-invariant'

/** No runtime invariant: one header slot entry over the mem Remote. */
export function apply(): void {}
