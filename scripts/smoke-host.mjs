/**
 * Offline host-stack smoke test: constructs the MemService against stub
 * cordis services and exercises record/search/configure/re-embed without
 * the harness server.
 */
import { Context } from '@deepseek-ai/cordis'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { createServer } from 'node:http'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { MemService, latestUserText, renderMemoryContext } from '../packages/mem/lib/index.js'
import { EmbeddingService } from '../packages/mem/lib/embedding.js'

/** Local fake Hugging Face: serves model listings and files for download tests. */
function fakeHfServer() {
  const files = {
    'config.json': '{}',
    'tokenizer.json': '{"version":"1.0"}',
    'tokenizer_config.json': '{}',
    'special_tokens_map.json': '{}',
    'onnx/model_quantized.onnx': Buffer.alloc(1024, 7),
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const listing = url.pathname.match(/^\/api\/models\/(.+)$/)
    if (listing !== null) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ siblings: Object.keys(files).map((rfilename) => ({ rfilename })) }))
      return
    }
    const fileMatch = url.pathname.match(/^\/(.+)\/resolve\/main\/(.+)$/)
    if (fileMatch !== null) {
      const [, model, file] = fileMatch
      if (model === 'Xenova/slow-model') {
        setTimeout(() => {
          res.writeHead(200)
          res.end(files[file] ?? 'x')
        }, 15000)
        return
      }
      if (model === 'Xenova/broken-model') {
        res.writeHead(404)
        res.end('missing')
        return
      }
      if (files[file] === undefined) {
        res.writeHead(404)
        res.end('missing')
        return
      }
      res.writeHead(200)
      res.end(files[file])
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

const dbPath = '/home/vncuser/workdir/dsh-mem/.shots/memtest.sqlite'

/** Tools captured from the registry stub for end-to-end tool validation. */
const capturedTools = []

const ctx = new Context()
ctx.plugin({
  name: 'stub-tools',
  apply: (c) => {
    c.provide('tools', { register: (tool) => { capturedTools.push(tool); return () => {} } })
    c.provide('systemPrompt', { section: () => {} })
    c.provide('agents', { get: () => undefined, currentInitiator: () => undefined, roots: () => [] })
  },
})
ctx.plugin({
  name: 'mem-test',
  apply: (c) => {
    c.inject(['tools', 'systemPrompt', 'agents'], async (scoped) => {
    try {
    const service = new MemService(scoped, {
      dbPath,
      modelCacheDir: '/home/vncuser/.dsh/storages/mem-models',
    })

    console.log('1. status before warmup:', JSON.stringify({ model: service.status().model, dims: service.status().dimensions, ready: service.status().ready }))

    // record two memories with the default model (nomic 768d)
    const r1 = await service.record(fakeAgent('/home/vncuser/workdir'), { content: 'The DSH web GUI runs on port 29095 and is served by dsh web.' })
    const r2 = await service.record(fakeAgent('/home/vncuser/workdir'), { content: 'opencode-mem uses a local embedding model with SQLite vector storage.' })
    console.log('2. recorded:', r1.status, r2.status, 'count:', service.status().count, 'dims:', service.status().dimensions, 'ready:', service.status().ready)

    const s1 = await service.search(fakeAgent('/home/vncuser/workdir'), { query: 'which port does the web gui use', limit: 3 })
    console.log('3. search hit:', s1.results[0]?.content.slice(0, 60), 'sim:', s1.results[0]?.similarity?.toFixed(3))

    // switch to the small CPU model (384d) — no auto re-embed; the transform
    // button flow: configure leaves rows stale, reembed() migrates them.
    const cfg = await service.configure({ model: 'Xenova/all-MiniLM-L6-v2' })
    console.log('4. configured:', JSON.stringify(cfg), '(stale rows await the transform button)')
    if (service.status().staleCount === 0) throw new Error('expected stale rows after dimension switch')
    const re = service.reembed()
    console.log('4b. reembed started:', re.started, 'stale:', re.stale)
    for (let i = 0; i < 60 && service.status().reembed !== null; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    console.log('5. after transform: stale =', service.status().staleCount, 'reembed =', JSON.stringify(service.status().reembed))

    const s2 = await service.search(fakeAgent('/home/vncuser/workdir'), { query: 'embedding model local storage', limit: 3 })
    console.log('6. cross-dim search after re-embed:', s2.results.length > 0 ? s2.results[0].content.slice(0, 60) : 'NO HITS', 'sim:', s2.results[0]?.similarity?.toFixed(3))

    const models = service.models()
    console.log('7. catalog:', models.catalog.map((m) => `${m.label}(${m.dims}d,${m.cached ? 'local' : 'remote'})`).join(' | '))

    // cache stats + all-memory listing (stats modal endpoints)
    const searchAgain = await service.search(fakeAgent('/home/vncuser/workdir'), { query: 'embedding model local storage', limit: 3 })
    const cache = service.cacheStats()
    console.log('8. cacheStats:', JSON.stringify({ hits: cache.hits, misses: cache.misses, size: cache.size, top: cache.top.slice(0, 2).map((t) => [t.text.slice(0, 24), t.hits]) }))
    const all = service.listAll(fakeAgent('/home/vncuser/workdir'), { scope: 'all', sort: 'createdAtDesc', page: 1, pageSize: 50 })
    console.log('9. listAll:', JSON.stringify({ total: all.total, page: all.page, first: all.items[0]?.content.slice(0, 30), dims: all.items[0]?.dims, enabled: all.items[0]?.enabled }))
    if (searchAgain.results.length === 0) throw new Error('repeat search unexpectedly empty')

    // enable/disable: a disabled memory leaves search
    const firstId = all.items[0].id
    const off = service.setEnabled({ id: firstId, enabled: false })
    const hidden = await service.search(fakeAgent('/home/vncuser/workdir'), { query: all.items[0].content.slice(0, 20), limit: 5 })
    const back = service.setEnabled({ id: firstId, enabled: true })
    const visible = await service.search(fakeAgent('/home/vncuser/workdir'), { query: all.items[0].content.slice(0, 20), limit: 5 })
    console.log('10. setEnabled:', JSON.stringify({ off: off.updated, hiddenHits: hidden.results.length, back: back.updated, visibleHits: visible.results.length }))
    if (hidden.results.some((hit) => hit.id === firstId)) throw new Error('disabled memory still searchable')
    if (!visible.results.some((hit) => hit.id === firstId)) throw new Error('re-enabled memory missing from search')

    // download remote: status carries the download slot
    console.log('11. status.download slot:', service.status().download)

    // ── model-facing tools: execute + validate against their output schema ──
    // (the same validation the registry runs; catches INVALID_TOOL_OUTPUT bugs)
    {
      const exec = { agent: fakeAgent('/home/vncuser/workdir') }
      const recordTool = capturedTools.find((tool) => tool.name === 'simplemem_record')
      const searchTool = capturedTools.find((tool) => tool.name === 'simplemem_search')
      const forgetTool = capturedTools.find((tool) => tool.name === 'simplemem_forget')
      if (recordTool === undefined || searchTool === undefined || forgetTool === undefined) throw new Error('mem tools not registered')
      const validate = (tool, value) => {
        const violations = validateJsonSchemaValue(tool.output.schema, value)
        if (violations.length > 0) throw new Error(`${tool.name} output invalid: ${violations.join('; ')}`)
      }
      const recorded = await recordTool.execute({ content: 'smoke tool test: prefer uv for python tooling', tags: 'python,tool', scope: 'project' }, exec)
      validate(recordTool, recorded)
      const searched = await searchTool.execute({ query: 'python tooling', limit: 3, scope: 'project' }, exec)
      validate(searchTool, searched)
      if (!searched.results.some((hit) => hit.id === recorded.id)) throw new Error('tool search did not find the just-recorded memory')
      const forgotten = await forgetTool.execute({ memory_id: recorded.id }, exec)
      validate(forgetTool, forgotten)
      if (!forgotten.forgotten) throw new Error('tool forget failed')
      console.log('11b. tools execute + output schemas validate (record/search/forget)')

    // auto-injection helpers: latest human text + model-facing rendering
    const fakeEvents = [
      { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '  which python tool should we use?  ' }] } },
      { type: 'assistant/message', seq: 2, data: {} },
      { type: 'user/message', seq: 3, data: { source: { kind: 'goal' }, content: [{ type: 'text', text: 'goal continuation' }] } },
    ]
    const text = latestUserText({ events: fakeEvents })
    if (text !== 'which python tool should we use?') throw new Error(`latestUserText wrong: ${text}`)
    const rendered = renderMemoryContext([{ content: 'prefer uv for python', similarity: 0.8 }])
    if (!rendered.includes('prefer uv for python') || !rendered.includes('Relevant memories')) throw new Error('renderMemoryContext wrong')
    console.log('11c. latestUserText (skips goal-sourced) + renderMemoryContext ok')
    }

    // ── download / cancel / failure tests against a local fake HF server ──
    // Driven through EmbeddingService directly (the download logic's home):
    // the Remotes are thin wrappers already covered by the face registration.
    {
      const { server, port } = await fakeHfServer()
      const dlCache = '/home/vncuser/workdir/dsh-mem/.shots/dl-cache'
      rmSync(dlCache, { recursive: true, force: true })
      try {
        const dl = new EmbeddingService('Xenova/nomic-embed-text-v1', 768, dlCache, false, `http://127.0.0.1:${port}`)
        // waitDl returns { ok } — a matching null state is a SUCCESS here.
        const waitDl = async (predicate, timeoutMs = 20000) => {
          const start = Date.now()
          while (Date.now() - start < timeoutMs) {
            const state = dl.downloadState
            if (predicate(state)) return { ok: true, state }
            await new Promise((r) => setTimeout(r, 250))
          }
          return { ok: false, state: dl.downloadState }
        }

        // success path
        if (!dl.startDownload('Xenova/test-model')) throw new Error('download did not start')
        const done = await waitDl((state) => state === null, 15000)
        if (!done.ok) throw new Error(`download success path failed: ${JSON.stringify(done.state)}`)
        if (!dl.isCachedFor('Xenova/test-model')) throw new Error('downloaded model not recognised as cached')
        console.log('12. download success: files cached, state cleared')

        // cancel path
        dl.startDownload('Xenova/slow-model')
        await new Promise((r) => setTimeout(r, 700))
        const cancel = dl.cancelDownload()
        const cancelled = await waitDl((state) => state === null, 5000)
        if (!cancel || !cancelled.ok) throw new Error(`cancel path failed: ${JSON.stringify(cancelled.state)}`)
        const leftover = readdirSync(dlCache).filter((name) => name.includes('slow-model'))
        if (leftover.length > 0) throw new Error(`cancel left partial files: ${leftover.join(',')}`)
        console.log('13. download cancel: aborted, partial files removed')

        // failure path cleans up (no partial dir left behind)
        dl.startDownload('Xenova/broken-model')
        const failed = await waitDl((state) => state !== null && state.state === 'error', 15000)
        if (!failed.ok) throw new Error(`failure path did not reach error state: ${JSON.stringify(failed.state)}`)
        if (existsSync(join(dlCache, 'Xenova/broken-model'))) throw new Error('failed download left a model dir')
        console.log('14. download failure: error state, no partial dir')

        // local-only warmup: a missing model fails fast with a clear message
        const empty = new EmbeddingService('Xenova/nomic-embed-text-v1', 768, '/home/vncuser/workdir/dsh-mem/.shots/empty-cache', false, `http://127.0.0.1:${port}`)
        let warmupError = ''
        try {
          await empty.warmup()
        } catch (error) {
          warmupError = error instanceof Error ? error.message : String(error)
        }
        if (!warmupError.includes('model not cached')) throw new Error(`warmup did not fail fast: ${warmupError}`)
        console.log('14b. warmup missing model fails fast with a clear message')
      } finally {
        server.closeAllConnections?.()
        server.close()
      }
    }

    console.log('SMOKE OK')
    } catch (error) {
      console.error('SMOKE FAIL:', error?.stack ?? error)
      process.exitCode = 1
    }
    })
  },
})

function fakeAgent(cwd) {
  return { id: 'test-agent', session: fakeSession(cwd) }
}
function fakeSession(cwd) {
  return {
    id: 'test-session',
    header: { cwd, version: 0, id: 'test-session', createdAt: 0 },
  }
}
