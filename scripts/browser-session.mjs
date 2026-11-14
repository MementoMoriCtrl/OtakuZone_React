import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export async function openBrowser() {
  const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean)
  let executable
  for (const candidate of candidates) { try { await access(candidate); executable = candidate; break } catch { /* siguiente */ } }
  assert.ok(executable, 'Configura CHROME_PATH con Chrome/Edge instalado')
  const directory = await mkdtemp(join(tmpdir(), 'otakuzone-state-'))
  const browserProcess = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let socket
  try {
    let port
    for (let i = 0; i < 100; i++) { try { port = (await readFile(join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) } }
    assert.ok(port, 'Chrome no inició')
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    let id = 0
    const pending = new Map()
    const events = []
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data)
      if (message.id && pending.has(message.id)) {
        const task = pending.get(message.id); pending.delete(message.id)
        if (message.error) task.reject(message.error); else task.resolve(message.result)
      }
      if (message.method) events.push(message)
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id
      const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
      pending.set(key, { resolve: (value) => { clearTimeout(timer); resolve(value) }, reject: (error) => { clearTimeout(timer); reject(error) } })
      socket.send(JSON.stringify({ id: key, method, params }))
    })
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    const waitFor = async (expression, timeout = 10000) => {
      const start = Date.now()
      while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(80) }
      throw new Error(`Timeout: ${expression}`)
    }
    const navigate = async (path) => {
      await send('Page.navigate', { url: `${globalThis.process.env.AUDIT_URL ?? 'http://127.0.0.1:5173'}${path}` })
      await waitFor(`location.pathname === ${JSON.stringify(path.split('?')[0])} && !!document.querySelector('main h1')`)
    }
    const click = async (selector) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(80) }
    const input = async (selector, value) => {
      await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); })()`)
    }
    const select = async (name, value) => { await evaluate(`(() => { const element = document.querySelector('select[name="${name}"]'); element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('change', { bubbles: true })); })()`); await delay(80) }
    const screenshot = async (name) => {
      const capture = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(directory, `${name}.png`)
      await writeFile(file, Buffer.from(capture.data, 'base64'))
      console.log(`Captura: ${file}`)
    }
    const resize = async (width) => { await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }); await delay(80) }
    await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable'); await send('Page.bringToFront')
    return { send, evaluate, waitFor, navigate, click, input, select, screenshot, resize, events, close: async () => { try { await send('Browser.close') } finally { socket.close(); browserProcess.kill() } } }
  } catch (error) { socket?.close(); browserProcess.kill(); throw error }
}
