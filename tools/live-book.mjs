import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot } from './lib/workspace.mjs'
import { ensureCleanBase, readAnnotationState, saveAnnotations } from './lib/annotations.mjs'
import { assembleChapters } from './assemble-chapters.mjs'
import { buildBook } from './build-book.mjs'

const contentTypes = {
  '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff'
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(`${JSON.stringify(value)}\n`)
}

async function readJson(request, maximumBytes = 20 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maximumBytes) {
      const error = new Error('Annotation request is too large')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch {
    const error = new Error('Request body must be valid JSON')
    error.status = 400
    throw error
  }
}

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
  for (const relative of ['course.yml', 'sources.yml', 'study-data', 'notes/index.md', 'notes/guide.md', 'notes/slides', 'notes/sections', 'notes/annotations', 'notes/public', 'tools/site']) visit(relative)
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
    if (requestPath === '/__live/annotation.js' || requestPath === '/__live/annotation.css') {
      const name = requestPath.endsWith('.js') ? 'annotation.js' : 'annotation.css'
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(name)], 'Cache-Control': 'no-store' })
      response.end(fs.readFileSync(new URL(`./site/${name}`, import.meta.url)))
      return
    }
    if (requestPath === '/__annotations/state' && request.method === 'GET') {
      const slide = new URL(request.url, 'http://localhost').searchParams.get('slide')
      readAnnotationState(root, slide).then(value => json(response, 200, value)).catch(cause => json(response, 400, { error: cause.message }))
      return
    }
    if (requestPath === '/__annotations/base' && request.method === 'GET') {
      try {
        const slide = new URL(request.url, 'http://localhost').searchParams.get('slide')
        const paths = ensureCleanBase(root, slide)
        response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
        fs.createReadStream(paths.basePath).pipe(response)
      } catch (cause) { json(response, 400, { error: cause.message }) }
      return
    }
    if (requestPath === '/__annotations/save' && request.method === 'POST') {
      ;(async () => {
        try {
          const body = await readJson(request)
          const value = await saveAnnotations(root, body.slide, body)
          json(response, 200, value)
        } catch (cause) {
          json(response, cause.code === 'STALE_BASE' ? 409 : cause.status ?? 400, { error: cause.message })
        }
      })()
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
      if (path.extname(target) === '.html') body = body.toString().replace('</head>', '<link rel="stylesheet" href="/__live/annotation.css"></head>').replace('</body>', `<script defer src="/__live/annotation.js"></script><script defer src="/__live/client.js" data-revision="${session}:${revision}"></script></body>`)
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
