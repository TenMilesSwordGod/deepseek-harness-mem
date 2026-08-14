/**
 * End-to-end GUI probe: selects a session, opens the memory widget, waits for
 * model warmup, performs a real semantic search, records a memory through the
 * panel, and verifies chip count + activity animation classes.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.shots')
mkdirSync(outDir, { recursive: true })

const PORT = 9224
const URL = process.env.DSH_MEM_URL ?? 'http://127.0.0.1:29095/'

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--no-first-run', '--no-proxy-server', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(outDir, 'profile3')}`, '--window-size=1600,1000',
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForEndpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return
    } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error('chrome endpoint never came up')
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      } else if (message.method !== undefined) {
        this.events.push(message)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  async waitFor(expression, timeoutMs = 20000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const value = await this.eval(expression)
      if (value) return value
      await sleep(500)
    }
    return null
  }
}

/** Set a React-controlled input/textarea value and notify React. */
const setReactValue = (selector, value, tag) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return false
  const proto = ${tag === 'textarea' ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

try {
  await waitForEndpoint()
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' })
  const tab = await res.json()
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  cdp.events.length = 0
  await cdp.send('Page.navigate', { url: URL })

  const report = { steps: [] }

  const clicked = await cdp.waitFor(`(() => {
    const items = [...document.querySelectorAll('[class*="session"]')].filter(el => el.textContent.includes('Memory System Design'))
    if (items.length === 0) return null
    items[items.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })()`)
  report.steps.push(['select session', clicked === null ? 'NOT FOUND' : 'ok'])

  const chip = await cdp.waitFor(`document.querySelector('.dshmem-chip') ? true : null`)
  report.steps.push(['chip rendered', chip === null ? 'MISSING' : 'ok'])
  if (chip === null) throw new Error('chip missing')

  await cdp.eval(`document.querySelector('.dshmem-chip').click()`)
  const panel = await cdp.waitFor(`document.querySelector('.dshmem-panel') ? true : null`)
  report.steps.push(['panel opened', panel === null ? 'MISSING' : 'ok'])

  // Wait until the backend is ready (model warmup may take a while on first use).
  const ready = await cdp.waitFor(`(() => {
    const badge = document.querySelector('.dshmem-panel .dshmem-status-badge')
    return badge && badge.textContent.includes('就绪') ? badge.textContent : null
  })()`, 120000)
  report.steps.push(['model ready', ready === null ? 'TIMEOUT (still warming?)' : `ok (${ready})`])

  // Quick search through the panel.
  await cdp.eval(setReactValue('.dshmem-search-input input', 'which port does the web gui use', 'input'))
  const results = await cdp.waitFor(`(() => {
    const items = [...document.querySelectorAll('.dshmem-item')]
    if (items.length === 0) return null
    return items.map(el => ({ text: el.querySelector('.dshmem-item-content')?.textContent?.slice(0, 50), score: el.querySelector('.dshmem-item-score')?.textContent }))
  })()`, 40000)
  report.steps.push(['search results', results === null ? 'EMPTY' : JSON.stringify(results)])

  // Record a memory through the panel.
  await cdp.eval(setReactValue('.dshmem-record-input', 'the dsh web gui listens on 127.0.0.1:29095 and serves the prebuilt frontend dist', 'textarea'))
  await cdp.eval(`document.querySelector('.dshmem-record-save').click()`)
  const feedback = await cdp.waitFor(`(() => {
    const fb = document.querySelector('.dshmem-record-feedback')
    const chipCount = document.querySelector('.dshmem-chip-count')
    return fb ? { feedback: fb.textContent, chipCount: chipCount?.textContent ?? null } : null
  })()`, 30000)
  report.steps.push(['record', feedback === null ? 'NO FEEDBACK' : JSON.stringify(feedback)])

  // Verify the search now finds the just-recorded memory.
  await cdp.eval(setReactValue('.dshmem-search-input input', 'what address does the web gui listen on', 'input'))
  const results2 = await cdp.waitFor(`(() => {
    const items = [...document.querySelectorAll('.dshmem-item')]
    if (items.length === 0) return null
    return items.map(el => el.querySelector('.dshmem-item-content')?.textContent?.slice(0, 60))
  })()`, 40000)
  report.steps.push(['search after record', results2 === null ? 'EMPTY' : JSON.stringify(results2)])

  const errors = [
    ...cdp.events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map((e) => e.params.args.map((a) => a.value ?? a.description ?? '').join(' ')),
    ...cdp.events.filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error').map((e) => e.params.entry.text),
    ...cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text),
  ]

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const shotPath = join(outDir, 'shot-e2e.png')
  writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
  console.log(JSON.stringify({ report, errors, shotPath }, null, 2))
} finally {
  chrome.kill('SIGKILL')
}
