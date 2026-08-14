/**
 * Build the browser bundle for the client plugin: esbuild bundles
 * src/client/index.ts into the module-loader handoff format the DSH web
 * kernel expects (window.__ModuleLoader__.load with a CJS factory), with
 * react and @deepseek-ai/* packages left external (the kernel's module
 * table resolves them) and zod bundled in.
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const entry = join(root, 'src/client/index.ts')
const outfile = join(root, 'lib/client.js')

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  outfile,
  logLevel: 'info',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/*',
  ],
})

if (result.errors.length > 0) process.exit(1)

// Node half (host side): plain ESM transform, no bundling.
await build({
  entryPoints: [join(root, 'src/index.ts'), join(root, 'src/invariant.ts')],
  bundle: false,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  outdir: join(root, 'lib'),
  logLevel: 'info',
})

const body = readFileSync(outfile, 'utf8')
const wrapped = `window.__ModuleLoader__.load({
	id: "simplemem-web",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
		return module.exports;
	}
})
`
writeFileSync(outfile, wrapped)
console.log(`client bundle written: ${outfile} (${wrapped.length} bytes)`)
