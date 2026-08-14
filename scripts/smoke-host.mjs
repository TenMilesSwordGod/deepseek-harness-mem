/**
 * Offline host-stack smoke test: constructs the MemService against stub
 * cordis services and exercises record/search/configure/re-embed without
 * the harness server.
 */
import { Context } from '@deepseek-ai/cordis'
import { MemService } from '../packages/mem/lib/index.js'

const dbPath = '/home/vncuser/workdir/dsh-mem/.shots/memtest.sqlite'

const ctx = new Context()
ctx.plugin({
  name: 'stub-tools',
  apply: (c) => {
    c.provide('tools', { register: () => () => {} })
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
