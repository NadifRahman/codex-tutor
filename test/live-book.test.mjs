import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { createCanvas } from '@napi-rs/canvas'
import { createLiveBookServer, inputSnapshot } from '../tools/live-book.mjs'

async function until(check) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  assert.fail('Timed out waiting for live rebuild')
}

test('live server rebuilds notes and progress, retains good output on errors, and handles deletion', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-live-'))
  let server
  let reader
  try {
    for (const directory of ['notes/slides/week-01/lecture-a', 'tools/site', 'node_modules', 'study-data']) fs.mkdirSync(path.join(root, directory), { recursive: true })
    fs.symlinkSync(path.join(process.cwd(), 'node_modules/katex'), path.join(root, 'node_modules/katex'), process.platform === 'win32' ? 'junction' : 'dir')
    for (const name of ['style.css', 'book.js']) fs.copyFileSync(path.join(process.cwd(), 'tools/site', name), path.join(root, 'tools/site', name))
    const write = (name, text) => fs.writeFileSync(path.join(root, name), text)
    write('notes/index.md', '# Test\n')
    write('notes/guide.md', '# Guide\n')
    write('course.yml', 'course:\n  code: TEST\n  title: Original course\n')
    write('sources.yml', 'sources: []\n')
    write('study-data/progress.yml', 'slides: {}\n')
    const slide = 'notes/slides/week-01/lecture-a/slide-001.md'
    write(slide, '# Slide 1\nOriginal explanation\n')
    server = createLiveBookServer({ root, interval: 30 })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const get = async (url = '/') => (await fetch(base + url)).text()
    assert.match(await get('/chapters/week-01/'), /Original explanation/)
    assert.match(await get('/chapters/week-01/'), /data-revision=/)
    const response = await fetch(base + '/__live/events')
    reader = response.body.getReader()
    const events = []
    let buffer = ''
    const reading = (async () => {
      const decoder = new TextDecoder()
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) return
        buffer += decoder.decode(chunk.value)
        const packets = buffer.split('\n\n')
        buffer = packets.pop()
        for (const packet of packets) events.push(JSON.parse(packet.slice(6)))
      }
    })()
    await until(() => events.length === 1)
    write(slide, '# Slide 1\nUpdated explanation\n')
    await until(async () => (await get('/chapters/week-01/')).includes('Updated explanation'))
    await until(() => events.length === 2)
    assert.notEqual(events[0].revision, events[1].revision)
    assert.match(await get('/search.json'), /Updated explanation/)
    write('study-data/progress.yml', 'slides:\n  lecture-a-slide-001:\n    status: understood\n')
    await until(async () => (await get()).includes('1 of 1 slides understood'))
    write(slide, '# Slide 1\n$\\notARealMathCommand$\n')
    await until(() => events.at(-1).error)
    assert.match(await get('/chapters/week-01/'), /Updated explanation/)
    const failedRevision = events.at(-1).revision
    write(slide, '# Slide 1\nRecovered explanation\n')
    await until(() => !events.at(-1).error && events.at(-1).revision !== failedRevision)
    assert.match(await get('/chapters/week-01/'), /Recovered explanation/)
    write('notes/slides/week-01/lecture-a/slide-002.md', '# Slide 2\nNew slide\n')
    await until(async () => (await get('/chapters/week-01/')).includes('New slide'))
    fs.unlinkSync(path.join(root, slide))
    fs.unlinkSync(path.join(root, 'notes/slides/week-01/lecture-a/slide-002.md'))
    await until(async () => (await fetch(base + '/chapters/week-01/')).status === 404)
    assert.doesNotMatch(await get('/search.json'), /Recovered explanation|New slide/)
    fs.mkdirSync(path.join(root, 'notes/sections/review'), { recursive: true })
    write('notes/sections/review/index.md', '# Review\nFirst discussion\n')
    await until(async () => (await get('/sections/review/')).includes('First discussion'))
    write('notes/sections/review/index.md', '# Review\nClarified discussion\n')
    await until(async () => (await get('/sections/review/')).includes('Clarified discussion'))
    assert.match(await get('/search.json'), /Clarified discussion/)
    assert.match(await get('/print/'), /Clarified discussion/)
    assert.equal(fs.readFileSync(path.join(root, 'notes/sections/review/index.md'), 'utf8'), '# Review\nClarified discussion\n')
    fs.unlinkSync(path.join(root, 'notes/sections/review/index.md'))
    await until(async () => (await fetch(base + '/sections/review/')).status === 404)
    assert.doesNotMatch(await get('/search.json'), /Clarified discussion/)
    const count = events.length
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(events.length, count, 'generated output must not cause rebuild loops')
    assert.equal((await fetch(base + '/%E0%A4%A')).status, 400)
    await reader.cancel()
    await reading
  } finally {
    if (reader) await reader.cancel()
    if (server) await new Promise(resolve => server.close(resolve))
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('snapshot excludes derived chapters and book output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-watch-'))
  try {
    const before = inputSnapshot(root)
    for (const name of ['notes/chapters/week-01.md', '.study-cache/book/index.html']) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
      fs.writeFileSync(path.join(root, name), 'generated')
    }
    assert.equal(inputSnapshot(root), before)
    fs.mkdirSync(path.join(root, 'study-data'), { recursive: true })
    fs.writeFileSync(path.join(root, 'study-data/progress.yml'), 'slides: {}')
    assert.notEqual(inputSnapshot(root), before)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('live server exposes the annotation editor and safely saves slide annotations', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-live-annotations-'))
  let server
  try {
    for (const directory of ['notes/slides/week-01/lecture-a', 'notes/public/generated/lecture-a', 'tools/site', 'node_modules', 'study-data']) fs.mkdirSync(path.join(root, directory), { recursive: true })
    fs.symlinkSync(path.join(process.cwd(), 'node_modules/katex'), path.join(root, 'node_modules/katex'), process.platform === 'win32' ? 'junction' : 'dir')
    for (const name of ['style.css', 'book.js']) fs.copyFileSync(path.join(process.cwd(), 'tools/site', name), path.join(root, 'tools/site', name))
    fs.writeFileSync(path.join(root, 'notes/index.md'), '# Test\n')
    fs.writeFileSync(path.join(root, 'notes/guide.md'), '# Guide\n')
    fs.writeFileSync(path.join(root, 'course.yml'), 'course:\n  code: TEST\n')
    fs.writeFileSync(path.join(root, 'sources.yml'), 'sources: []\n')
    fs.writeFileSync(path.join(root, 'study-data/progress.yml'), 'slides: {}\n')
    fs.writeFileSync(path.join(root, 'notes/slides/week-01/lecture-a/slide-001.md'), '# Slide 1\n\n![Original slide](../../../public/generated/lecture-a/slide-001.png)\n\n**Key idea:** $x + y$.\n')
    const slide = createCanvas(160, 90)
    slide.getContext('2d').fillRect(0, 0, 160, 90)
    fs.writeFileSync(path.join(root, 'notes/public/generated/lecture-a/slide-001.png'), slide.toBuffer('image/png'))
    server = createLiveBookServer({ root, interval: 30 })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const html = await (await fetch(`${base}/chapters/week-01/`)).text()
    assert.match(html, /__live\/annotation\.js/)
    assert.match(html, /__live\/annotation\.css/)
    assert.match(html, /<section class="book-slide" data-slide-id="lecture-a-slide-001">[\s\S]*Key idea:[\s\S]*<\/section>/)
    const courseId = createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16)
    assert.match(html, new RegExp(`data-course-id="${courseId}"`))
    assert.equal((await fetch(`${base}/__live/annotation.js`)).status, 200)
    const stateResponse = await fetch(`${base}/__annotations/state?slide=generated%2Flecture-a%2Fslide-001.png`)
    const state = await stateResponse.json()
    assert.equal(state.width, 160)
    assert.equal((await fetch(`${base}/__annotations/base?slide=generated%2Flecture-a%2Fslide-001.png`)).headers.get('content-type'), 'image/png')
    const saveResponse = await fetch(`${base}/__annotations/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state, objects: [{ id: 'line', type: 'line', color: '#ff0000', width: .02, opacity: 1, x1: .1, y1: .1, x2: .9, y2: .9 }] })
    })
    assert.equal(saveResponse.status, 200)
    assert.ok(fs.existsSync(path.join(root, 'notes/annotations/lecture-a/slide-001.json')))
    const staleResponse = await fetch(`${base}/__annotations/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...state, baseHash: 'stale', objects: [] }) })
    assert.equal(staleResponse.status, 409)
    assert.equal((await fetch(`${base}/__annotations/state?slide=..%2Fsecret.png`)).status, 400)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('browser refresh waits for annotation editing to close and retains the slide offset', () => {
  const source = fs.readFileSync(new URL('../tools/site/live-refresh.js', import.meta.url), 'utf8')
  let events, reloads = 0, onload, scroll
  const saved = new Map()
  const anchor = { id: 'slide-1', getBoundingClientRect: () => ({ top: -80 }) }
  const modal = { hidden: false }
  const listeners = new Map()
  const context = {
    location: { pathname: '/chapters/week-01/', reload: () => reloads++ },
    sessionStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    window: { scrollY: 400, addEventListener: (name, fn) => { onload = fn }, scrollTo: (x, y) => { scroll = y } },
    document: {
      currentScript: { dataset: { revision: 'v1' } }, createElement: () => ({ setAttribute() {}, style: {} }), body: { append() {} },
      querySelector: () => modal, querySelectorAll: () => [anchor], getElementById: () => anchor,
      addEventListener: (name, fn) => listeners.set(name, fn)
    },
    EventSource: class { constructor() { events = this } }
  }
  const update = (revision, error = false) => events.onmessage({ data: JSON.stringify({ revision, error }) })
  vm.runInNewContext(source, context)
  update('v1', true)
  assert.equal(reloads, 0)
  update('v2')
  update('v3')
  update('v3', true)
  assert.equal(reloads, 0, 'an open editor must not be interrupted')
  modal.hidden = true
  listeners.get('annotation-editor-closed')()
  assert.equal(reloads, 1)
  listeners.get('annotation-editor-closed')()
  update('v3')
  assert.equal(reloads, 1, 'pending rebuilds should cause only one reload')
  context.document.currentScript.dataset.revision = 'v3'
  vm.runInNewContext(source, context)
  onload()
  assert.equal(scroll, 400)
  assert.equal(saved.size, 0)
  update('v4', true)
  assert.equal(reloads, 1, 'failed builds must not reload')
  update('v4')
  assert.equal(reloads, 2, 'refresh resumes immediately when the editor is closed')
})
