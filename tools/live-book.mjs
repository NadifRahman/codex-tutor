import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot } from './lib/workspace.mjs'
import { assembleChapters } from './assemble-chapters.mjs'
import { buildBook } from './build-book.mjs'

// Polling handles editor atomic saves across supported platforms.
export function inputSnapshot(root) {
  const entries = []
  function visit(relative) {
    const absolute = path.join(root, relative)
    if (!fs.existsSync(absolute)) return
    const stat = fs.statSync(absolute)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name))
    } else entries.push(`${relative}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`)
  }
  for (const relative of ['course.yml', 'sources.yml', 'study-data', 'notes/index.md', 'notes/guide.md', 'notes/slides', 'notes/sections', 'notes/public', 'tools/site']) visit(relative)
  const sources = path.join(root, '.study-cache', 'sources')
  if (fs.existsSync(sources)) for (const id of fs.readdirSync(sources).sort()) visit(path.join('.study-cache', 'sources', id, 'manifest.json'))
  return entries.join('\n')
}

export function createLiveBookServer({ root = repoRoot, interval = 500 } = {}) {
  let servedRoot
  let revision = 0
  let error = false
  const session = Date.now().toString(36)
  const clients = new Set()
  const state = () => JSON.stringify({ revision: `${session}:${revision}`, error })
  function rebuild() {
    const destination = path.join(root, '.study-cache', `book-live-${revision % 2}`)
    try {
      // Recreate derived chapters so deleting a week's last slide removes it.
      const chapters = path.join(root, 'notes', 'chapters')
      if (fs.existsSync(chapters)) for (const name of fs.readdirSync(chapters)) {
        if (/^week-\d+\.md$/.test(name)) fs.unlinkSync(path.join(chapters, name))
      }
      assembleChapters(root)
      buildBook(root, destination)
      servedRoot = destination
      revision += 1
      error = false
    } catch (cause) {
      error = true
      console.error(`Live rebuild failed: ${cause.message}`)
    }
    for (const client of clients) client.write(`data: ${state()}\n\n`)
  }
  let previous = inputSnapshot(root)
  rebuild()
  const contentTypes = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' }
  const server = http.createServer((request, response) => {
    let requestPath
    try { requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname) }
    catch { response.writeHead(400).end('Invalid URL'); return }
    if (requestPath === '/__live/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
      clients.add(response)
      response.write(`data: ${state()}\n\n`)
      request.on('close', () => clients.delete(response))
      return
    }
    if (requestPath === '/__live/client.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' })
      response.end(fs.readFileSync(new URL('./site/live-refresh.js', import.meta.url)))
      return
    }
    if (!servedRoot) {
      response.writeHead(503, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end('<!doctype html><p>Waiting for a successful book build. Check the terminal for errors.</p><script defer src="/__live/client.js"></script>')
      return
    }
    let target = path.resolve(servedRoot, `.${requestPath}`)
    if (target !== servedRoot && !target.startsWith(`${servedRoot}${path.sep}`)) {
      response.writeHead(403).end('Forbidden'); return
    }
    try {
      if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html')
      let body = fs.readFileSync(target)
      if (path.extname(target) === '.html') body = body.toString().replace('</body>', `<script defer src="/__live/client.js" data-revision="${session}:${revision}"></script></body>`)
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
      response.end(body)
    } catch { response.writeHead(404).end('Not found') }
  })
  let pending = false
  const timer = setInterval(() => {
    try {
      const current = inputSnapshot(root)
      if (current !== previous) { previous = current; pending = true }
      else if (pending) { pending = false; rebuild() }
    } catch (cause) { console.error(`Could not check book inputs: ${cause.message}`) }
  }, interval)
  timer.unref()
  const close = server.close.bind(server)
  server.close = (...args) => {
    clearInterval(timer)
    for (const client of clients) client.end()
    return close(...args)
  }
  return server
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const server = createLiveBookServer()
  const port = Number(process.env.PORT ?? 4173)
  server.listen(port, '127.0.0.1', () => console.log(`Course book: http://127.0.0.1:${port} (live refresh enabled)`))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close())
}
