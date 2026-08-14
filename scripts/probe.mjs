/**
 * CDP verification driver: opens the live harness, selects an existing
 * session, then probes the memory widget DOM (chip position, panel content,
 * remote round-trips) without touching the running server.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.shots')
mkdirSync(outDir, { recursive: true })

const PORT = 9223
const URL = process.env.DSH_MEM_URL ?? 'http://127.0.0.1:29095/'

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--no-first-run', '--no-proxy-server', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(outDir, 'profile2')}`, '--window-size=1600,1000',
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

  async waitFor(expression, timeoutMs = 15000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const value = await this.eval(expression)
      if (value) return value
      await sleep(400)
    }
    return null
  }
}

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

  // Wait for the sidebar session list, then click the memory-design session.
  const clicked = await cdp.waitFor(`(() => {
    const items = [...document.querySelectorAll('[class*="session"]')].filter(el => el.textContent.includes('Memory System Design'))
    if (items.length === 0) return null
    const target = items[items.length - 1]
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })()`)
  if (clicked === null) {
    console.log(JSON.stringify({ clicked: false, note: 'session item not found' }))
  } else {
    // Wait for the memory chip in the header.
    const chip = await cdp.waitFor(`(() => {
      const el = document.querySelector('.dshmem-chip')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { text: el.textContent, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(window.innerWidth - r.right) }
    })()`)

    let panelProbe = null
    if (chip !== null) {
      // Open the panel and probe its content.
      await cdp.eval(`document.querySelector('.dshmem-chip').click()`)
      panelProbe = await cdp.waitFor(`(() => {
        const p = document.querySelector('.dshmem-panel')
        if (!p) return null
        return { text: p.textContent.replace(/\\s+/g, ' ').slice(0, 400), w: Math.round(p.getBoundingClientRect().width) }
      })()`, 8000)
    }

    const errors = [
      ...cdp.events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map((e) => e.params.args.map((a) => a.value ?? a.description ?? '').join(' ')),
      ...cdp.events.filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error').map((e) => e.params.entry.text),
      ...cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text),
    ]

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const shotPath = join(outDir, 'shot-panel.png')
    writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
    console.log(JSON.stringify({ clicked, chip, panelProbe, errors, shotPath }, null, 2))
  }
} finally {
  chrome.kill('SIGKILL')
}
