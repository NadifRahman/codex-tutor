import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../tools/site/annotation.js', import.meta.url), 'utf8')
const toolNames = ['select', 'pen', 'highlighter', 'eraser', 'line', 'arrow', 'rectangle', 'ellipse', 'text']

function element(initial = {}) {
  const listeners = new Map()
  const attributes = new Map()
  return {
    value: '', checked: false, dataset: {}, style: {}, hidden: false, textContent: '', ...initial,
    addEventListener(name, listener) { listeners.set(name, listener) },
    fire(name, event = {}) { return listeners.get(name)?.(event) },
    setAttribute(name, value) { attributes.set(name, value) },
    getAttribute(name) { return attributes.get(name) }
  }
}

function createEditor({ courseId = 'course-a', storage = new Map(), images = [], storageUnavailable = false, fetchChapter, fetchAnnotations, confirm = () => false } = {}) {
  const controls = {
    canvas: element({ getContext: () => ({
      clearRect() {}, drawImage() {}, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {},
      lineTo() {}, stroke() {}, rect() {}, ellipse() {}, fillText() {}, strokeRect() {}, setLineDash() {}, fillRect() {}
    }) }),
    '.annotation-stage': element({ clientWidth: 800, clientHeight: 600 }),
    '.annotation-status': element(),
    '.annotation-color': element({ value: '#e53935' }),
    '.annotation-fill': element({ value: '#fff176' }),
    '.annotation-fill-enabled': element(),
    '.annotation-width': element({ value: '5' }),
    '.annotation-opacity': element({ value: '1' }),
    '.annotation-pressure': element({ checked: true }),
    '.annotation-notes': element({ scrollTop: 0 }),
    '.annotation-notes-update': element({ hidden: true }),
    '.annotation-notes-toggle': element(),
    '.annotation-save': element(),
    '.annotation-position': element(),
    '[data-action="undo"]': element(),
    '[data-action="redo"]': element(),
    '[data-action="zoom-in"]': element(),
    '[data-action="zoom-out"]': element(),
    '[data-action="fit"]': element(),
    '[data-action="clear"]': element(),
    '[data-action="note"]': element(),
    '[data-action="previous"]': element(),
    '[data-action="next"]': element(),
    '[data-action="cancel"]': element(),
    '[data-action="save"]': element()
  }
  const notes = element({ childNodes: [] })
  notes.replaceChildren = () => { notes.childNodes = []; notes.textContent = '' }
  notes.append = (...nodes) => { notes.childNodes.push(...nodes); notes.textContent = nodes.map(node => node.textContent).join('') }
  controls['.annotation-notes-content'] = notes
  const buttons = toolNames.map(name => element({ dataset: { tool: name } }))
  const modal = element({ querySelector: selector => controls[selector], querySelectorAll: () => buttons })
  const keyboard = new Map()
  const document = {
    currentScript: { dataset: { courseId } }, body: { style: {}, append() {} },
    createElement: tag => tag === 'div' ? modal : element(),
    querySelectorAll: selector => selector === 'main img' ? images : [],
    addEventListener(name, listener) { keyboard.set(name, listener) },
    dispatchEvent(event) { keyboard.get(event.type)?.(event) }
  }
  const localStorage = {
    getItem(key) { if (storageUnavailable) throw new Error('Storage blocked'); return storage.get(key) ?? null },
    setItem(key, value) { if (storageUnavailable) throw new Error('Storage blocked'); storage.set(key, value) },
    removeItem(key) { if (storageUnavailable) throw new Error('Storage blocked'); storage.delete(key) }
  }
  const context = {
    document, localStorage, location: { href: 'http://127.0.0.1:4173/chapters/week-01/', pathname: '/chapters/week-01/', search: '' },
    URL, Event, Image: class { async decode() {} },
    DOMParser: class { parseFromString(text) { return { querySelectorAll: () => JSON.parse(text).map(({ id, note }) => slideSection(id, note)) } } },
    fetch: (url, options) => url.startsWith('/__annotations/')
      ? fetchAnnotations?.(url, options) ?? Promise.resolve({ ok: true, json: async () => ({ objects: [], baseHash: 'base', width: 100, height: 100 }) })
      : fetchChapter?.(url, options) ?? Promise.reject(new Error('No chapter response')),
    window: { confirm, prompt: () => null, setTimeout() {} }
  }
  vm.runInNewContext(source, context)
  return { controls, buttons, modal, notes, keyboard, storage, document }
}

function slideSection(id, note) {
  return { dataset: { slideId: id }, cloneNode: () => ({ childNodes: [{ textContent: note }], querySelectorAll: () => [] }) }
}

function slideImage(name, note) {
  const image = element({ src: `http://127.0.0.1:4173/generated/lecture-a/${name}.png` })
  image.parentElement = { insertBefore(button) { image.launch = button } }
  image.closest = () => slideSection(`lecture-a-${name}`, note)
  return image
}

test('annotation preferences persist across page loads and stay course specific', () => {
  const storage = new Map()
  const first = createEditor({ storage })
  first.buttons.find(button => button.dataset.tool === 'rectangle').fire('click')
  const settings = [
    ['.annotation-color', '#112233'], ['.annotation-fill', '#abcdef'],
    ['.annotation-width', '12'], ['.annotation-opacity', '.55']
  ]
  for (const [selector, value] of settings) {
    first.controls[selector].value = value
    first.controls[selector].fire('input')
  }
  first.controls['.annotation-fill-enabled'].checked = true
  first.controls['.annotation-fill-enabled'].fire('change')
  first.controls['.annotation-pressure'].checked = false
  first.controls['.annotation-pressure'].fire('change')

  const restored = createEditor({ storage })
  assert.equal(restored.controls.canvas.dataset.tool, 'rectangle')
  assert.equal(restored.controls['.annotation-color'].value, '#112233')
  assert.equal(restored.controls['.annotation-fill'].value, '#abcdef')
  assert.equal(restored.controls['.annotation-width'].value, 12)
  assert.equal(restored.controls['.annotation-opacity'].value, .55)
  assert.equal(restored.controls['.annotation-fill-enabled'].checked, true)
  assert.equal(restored.controls['.annotation-pressure'].checked, false)
  const otherCourse = createEditor({ courseId: 'course-b', storage })
  assert.equal(otherCourse.controls.canvas.dataset.tool, undefined)
  assert.equal(otherCourse.controls['.annotation-color'].value, '#e53935')
})

test('invalid or unavailable preferences use defaults', () => {
  const storage = new Map([['course-tutor-annotation-settings:course-a', JSON.stringify({ tool: 'unknown', color: 'red', width: 100, opacity: -1, fill: 'yes' })]])
  const invalid = createEditor({ storage })
  assert.equal(invalid.controls['.annotation-color'].value, '#e53935')
  assert.equal(invalid.controls['.annotation-width'].value, '5')
  assert.equal(invalid.controls['.annotation-fill-enabled'].checked, false)
  const blocked = createEditor({ storageUnavailable: true })
  blocked.buttons[0].fire('click')
  assert.equal(blocked.controls.canvas.dataset.tool, 'select')
})

test('the annotation panel shows the selected slide notes and keyboard hints', async () => {
  const firstImage = slideImage('slide-001', 'Slide one explanation')
  const secondImage = slideImage('slide-002', 'Slide two equation')
  const editor = createEditor({ images: [firstImage, secondImage] })
  assert.match(editor.modal.innerHTML, /Pen <kbd>P<\/kbd>/)
  assert.match(editor.modal.innerHTML, /Ctrl\/⌘ S/)
  firstImage.launch.fire('click')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(editor.notes.textContent, 'Slide one explanation')
  secondImage.launch.fire('click')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(editor.notes.textContent, 'Slide two equation')

  const keydown = editor.keyboard.get('keydown')
  keydown({ key: 'e', target: { closest: () => ({}) } })
  assert.notEqual(editor.controls.canvas.dataset.tool, 'eraser')
  keydown({ key: 'e', target: { closest: () => null }, ctrlKey: false, metaKey: false })
  assert.equal(editor.controls.canvas.dataset.tool, 'eraser')
  editor.controls['.annotation-notes-toggle'].fire('click')
  assert.equal(editor.modal.dataset.notesOpen, 'true')
  assert.equal(editor.controls['.annotation-notes-toggle'].getAttribute('aria-expanded'), 'true')
})

const tick = () => new Promise(resolve => setImmediate(resolve))
const chapter = slides => ({ ok: true, text: async () => JSON.stringify(slides) })
const annotationState = (extra = {}) => ({ objects: [], baseHash: 'base', width: 100, height: 100, ...extra })
const draftStroke = { id: 'draft', type: 'stroke', tool: 'pen', color: '#e53935', width: .01, opacity: 1, note: '', pressureEnabled: false, points: [{ x: .1, y: .1, pressure: 1 }] }

test('previous and next navigate clean slides, update notes, and enforce boundaries', async () => {
  const firstImage = slideImage('slide-001', 'First notes')
  const secondImage = slideImage('slide-002', 'Second notes')
  const requests = []
  const editor = createEditor({ images: [firstImage, secondImage], fetchAnnotations: async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => annotationState() }
  } })

  await firstImage.launch.fire('click')
  assert.equal(editor.controls['.annotation-position'].textContent, 'Slide 1 of 2')
  assert.equal(editor.controls['[data-action="previous"]'].disabled, true)
  assert.equal(editor.controls['[data-action="next"]'].disabled, false)

  editor.buttons.find(button => button.dataset.tool === 'rectangle').fire('click')
  await editor.controls['[data-action="next"]'].fire('click')
  assert.equal(editor.notes.textContent, 'Second notes')
  assert.equal(editor.controls['.annotation-position'].textContent, 'Slide 2 of 2')
  assert.equal(editor.controls['[data-action="previous"]'].disabled, false)
  assert.equal(editor.controls['[data-action="next"]'].disabled, true)
  assert.equal(editor.controls.canvas.dataset.tool, 'rectangle')
  assert.equal(requests.filter(request => request.options?.method === 'POST').length, 0)
})

test('arrow shortcuts navigate except from interactive controls', async () => {
  const firstImage = slideImage('slide-001', 'First notes')
  const secondImage = slideImage('slide-002', 'Second notes')
  const editor = createEditor({ images: [firstImage, secondImage] })
  await firstImage.launch.fire('click')
  const keydown = editor.keyboard.get('keydown')

  keydown({ key: 'ArrowRight', target: { closest: () => ({}) }, ctrlKey: false, metaKey: false, preventDefault() {} })
  await tick()
  assert.equal(editor.notes.textContent, 'First notes')

  let prevented = false
  keydown({ key: 'ArrowRight', target: { closest: () => null }, ctrlKey: false, metaKey: false, repeat: false, preventDefault() { prevented = true } })
  await tick()
  assert.equal(prevented, true)
  assert.equal(editor.notes.textContent, 'Second notes')
})

test('navigation saves a restored dirty draft before loading the next slide', async () => {
  const firstImage = slideImage('slide-001', 'First notes')
  const secondImage = slideImage('slide-002', 'Second notes')
  const storage = new Map([['course-tutor-annotation:generated/lecture-a/slide-001.png', JSON.stringify({ baseHash: 'base', objects: [draftStroke] })]])
  const requests = []
  const editor = createEditor({ images: [firstImage, secondImage], storage, confirm: () => true, fetchAnnotations: async (url, options) => {
    requests.push({ url, options })
    if (options?.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) }
    return { ok: true, json: async () => annotationState() }
  } })

  await firstImage.launch.fire('click')
  await editor.controls['[data-action="next"]'].fire('click')
  const saves = requests.filter(request => request.options?.method === 'POST')
  assert.equal(saves.length, 1)
  assert.equal(JSON.parse(saves[0].options.body).slide, 'generated/lecture-a/slide-001.png')
  assert.equal(editor.notes.textContent, 'Second notes')
  assert.equal(storage.has('course-tutor-annotation:generated/lecture-a/slide-001.png'), false)
})

test('save failures keep the current slide open and prevent navigation', async () => {
  const firstImage = slideImage('slide-001', 'First notes')
  const secondImage = slideImage('slide-002', 'Second notes')
  const storage = new Map([['course-tutor-annotation:generated/lecture-a/slide-001.png', JSON.stringify({ baseHash: 'base', objects: [draftStroke] })]])
  const editor = createEditor({ images: [firstImage, secondImage], storage, confirm: () => true, fetchAnnotations: async (url, options) => {
    if (options?.method === 'POST') return { ok: false, json: async () => ({ error: 'The clean slide changed while the editor was open.' }) }
    return { ok: true, json: async () => annotationState() }
  } })

  await firstImage.launch.fire('click')
  await editor.controls['[data-action="next"]'].fire('click')
  assert.equal(editor.notes.textContent, 'First notes')
  assert.equal(editor.controls['.annotation-position'].textContent, 'Slide 1 of 2')
  assert.match(editor.controls['.annotation-status'].textContent, /clean slide changed/)
  assert.equal(editor.controls['[data-action="next"]'].disabled, false)
})

test('overlapping navigation attempts produce one save and one transition', async () => {
  const firstImage = slideImage('slide-001', 'First notes')
  const secondImage = slideImage('slide-002', 'Second notes')
  const storage = new Map([['course-tutor-annotation:generated/lecture-a/slide-001.png', JSON.stringify({ baseHash: 'base', objects: [draftStroke] })]])
  let releaseSave
  let saves = 0
  const editor = createEditor({ images: [firstImage, secondImage], storage, confirm: () => true, fetchAnnotations: async (url, options) => {
    if (options?.method === 'POST') {
      saves += 1
      await new Promise(resolve => { releaseSave = resolve })
      return { ok: true, json: async () => JSON.parse(options.body) }
    }
    return { ok: true, json: async () => annotationState() }
  } })

  await firstImage.launch.fire('click')
  const firstNavigation = editor.controls['[data-action="next"]'].fire('click')
  const duplicateNavigation = editor.controls['[data-action="next"]'].fire('click')
  await tick()
  assert.equal(saves, 1)
  releaseSave()
  await Promise.all([firstNavigation, duplicateNavigation])
  assert.equal(editor.notes.textContent, 'Second notes')
  assert.equal(saves, 1)
})

test('a rebuilt chapter updates only the open slide notes without disturbing canvas or scroll', async () => {
  const image = slideImage('slide-001', 'Old notes')
  const requests = []
  const editor = createEditor({ images: [image], fetchChapter: (url, options) => {
    requests.push({ url, options })
    return Promise.resolve(chapter([
      { id: 'lecture-a-slide-002', note: 'Wrong slide' },
      { id: 'lecture-a-slide-001', note: 'New notes' }
    ]))
  } })
  image.launch.fire('click')
  await tick()
  editor.controls['.annotation-notes'].scrollTop = 42
  const canvas = editor.controls.canvas
  const before = { width: canvas.width, height: canvas.height, tool: canvas.dataset.tool }
  editor.document.dispatchEvent(new Event('course-book-rebuilt'))
  await tick()
  assert.equal(editor.notes.textContent, 'New notes')
  assert.equal(editor.controls['.annotation-notes'].scrollTop, 42)
  assert.deepEqual({ width: canvas.width, height: canvas.height, tool: canvas.dataset.tool }, before)
  assert.equal(editor.modal.hidden, false)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/chapters/week-01/')
  assert.equal(requests[0].options.cache, 'no-store')

  editor.document.dispatchEvent(new Event('course-book-rebuilt'))
  await tick()
  assert.equal(editor.notes.textContent, 'New notes')
})

test('failed notes fetch retains content, and a removed slide is clearly reported', async () => {
  const image = slideImage('slide-001', 'Previous notes')
  let response = () => Promise.reject(new Error('offline'))
  const editor = createEditor({ images: [image], fetchChapter: () => response() })
  image.launch.fire('click')
  await tick()
  editor.document.dispatchEvent(new Event('course-book-rebuilt'))
  await tick()
  assert.equal(editor.notes.textContent, 'Previous notes')
  assert.equal(editor.controls['.annotation-notes-update'].hidden, false)
  response = () => Promise.resolve(chapter([{ id: 'lecture-a-slide-002', note: 'Other slide' }]))
  editor.document.dispatchEvent(new Event('course-book-rebuilt'))
  await tick()
  assert.match(editor.notes.textContent, /no longer in the rebuilt book/)
  assert.equal(editor.controls['.annotation-notes-update'].hidden, true)
})

test('out-of-order rebuilds and a fetch finishing after close never overwrite notes', async () => {
  const image = slideImage('slide-001', 'Original')
  const pending = []
  const editor = createEditor({ images: [image], fetchChapter: () => new Promise(resolve => pending.push(resolve)) })
  image.launch.fire('click')
  await tick()
  editor.document.dispatchEvent(new Event('course-book-rebuilt'))
  editor.document.dispatchEvent(new Event('course-book-rebuilt'))
  pending[1](chapter([{ id: 'lecture-a-slide-001', note: 'Latest' }]))
  await tick()
  pending[0](chapter([{ id: 'lecture-a-slide-001', note: 'Stale' }]))
  await tick()
  assert.equal(editor.notes.textContent, 'Latest')
  editor.document.dispatchEvent(new Event('course-book-rebuilt'))
  editor.controls['[data-action="cancel"]'].fire('click')
  pending[2](chapter([{ id: 'lecture-a-slide-001', note: 'After close' }]))
  await tick()
  assert.equal(editor.modal.hidden, true)
  assert.equal(editor.notes.textContent, 'Latest')
})
