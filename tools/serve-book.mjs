import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { repoRoot } from './lib/workspace.mjs'

const root = path.join(repoRoot, '.study-cache', 'book')
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Build the book first with npm run notes:build')
const contentTypes = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' }

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  let target = path.resolve(root, `.${requestPath}`)
  if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
    response.writeHead(403).end('Forbidden')
    return
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html')
  if (!fs.existsSync(target)) {
    response.writeHead(404).end('Not found')
    return
  }
  response.writeHead(200, { 'Content-Type': contentTypes[path.extname(target)] ?? 'application/octet-stream' })
  fs.createReadStream(target).pipe(response)
})

const port = Number(process.env.PORT ?? 4173)
server.listen(port, '127.0.0.1', () => console.log(`Course book: http://127.0.0.1:${port}`))

