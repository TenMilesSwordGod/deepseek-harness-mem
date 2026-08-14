/**
 * Minimal CDP driver: loads the live harness GUI in headless Chrome,
 * collects console errors, screenshots the page, and reports whether the
 * memory widget (`.dshmem-chip`) rendered. Used for visual verification
 * without touching the running server.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.shots')
mkdirSync(outDir, { recursive: true })

const PORT = 9222
const URL = process.env.DSH_MEM_URL ?? 'http://127.0.0.1:29095/'
const WAIT_MS = Number(process.env.DSH_MEM_WAIT ?? 9000)

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-proxy-server',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(outDir, 'profile')}`,
  '--window-size=1600,1000',
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForEndpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return
    } catch { /* chrome not up yet */ }
    await sleep(500)
  }
  throw new Error('chrome debugging endpoint never came up')
}

async function newTab(url) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!res.ok) throw new Error(`new tab failed: ${res.status}`)
  return res.json()
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
}

try {
  await waitForEndpoint()
  const tab = await newTab(URL)
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  const errors = []
  cdp.events.length = 0
  await cdp.send('Page.navigate', { url: URL })
  await sleep(WAIT_MS)

  const consoleErrors = cdp.events
    .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
    .map((e) => e.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
  const logErrors = cdp.events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text)
  const exceptions = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text)

  const probe = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      hasChip: !!document.querySelector('.dshmem-chip'),
      hasPanel: !!document.querySelector('.dshmem-panel'),
      hasStyle: [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.selectorText?.includes('dshmem')) } catch { return false } }),
      bootEntries: (window.__DSH_BOOT__?.entries ?? []).length,
      title: document.title,
      bodyText: document.body.innerText.slice(0, 200),
    })`,
    returnByValue: true,
  })
  const state = JSON.parse(probe.result.value)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const shotPath = join(outDir, 'shot.png')
  writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))

  console.log(JSON.stringify({ state, consoleErrors, logErrors, exceptions, shotPath }, null, 2))
} finally {
  chrome.kill('SIGKILL')
}
