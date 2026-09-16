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
    fire(name, event = {}) { listeners.get(name)?.(event) },
    setAttribute(name, value) { attributes.set(name, value) },
    getAttribute(name) { return attributes.get(name) }
  }
}

function createEditor({ courseId = 'course-a', storage = new Map(), images = [], storageUnavailable = false } = {}) {
  const controls = {
    canvas: element({ getContext: () => ({ clearRect() {}, drawImage() {} }) }),
    '.annotation-stage': element({ clientWidth: 800, clientHeight: 600 }),
    '.annotation-status': element(),
    '.annotation-color': element({ value: '#e53935' }),
    '.annotation-fill': element({ value: '#fff176' }),
    '.annotation-fill-enabled': element(),
    '.annotation-width': element({ value: '5' }),
    '.annotation-opacity': element({ value: '1' }),
    '.annotation-pressure': element({ checked: true }),
    '.annotation-notes-toggle': element(),
    '.annotation-save': element(),
    '[data-action="undo"]': element(),
    '[data-action="redo"]': element(),
    '[data-action="zoom-in"]': element(),
    '[data-action="zoom-out"]': element(),
    '[data-action="fit"]': element(),
    '[data-action="clear"]': element(),
    '[data-action="note"]': element(),
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
    addEventListener(name, listener) { keyboard.set(name, listener) }
  }
  const localStorage = {
    getItem(key) { if (storageUnavailable) throw new Error('Storage blocked'); return storage.get(key) ?? null },
    setItem(key, value) { if (storageUnavailable) throw new Error('Storage blocked'); storage.set(key, value) }
  }
  const context = {
    document, localStorage, location: { href: 'http://127.0.0.1:4173/chapters/week-01/', pathname: '/chapters/week-01/' },
    URL, Event, Image: class { async decode() {} },
    fetch: async () => ({ ok: true, json: async () => ({ objects: [], baseHash: 'base', width: 100, height: 100 }) }),
    window: { confirm: () => false, prompt: () => null, setTimeout() {} }
  }
  vm.runInNewContext(source, context)
  return { controls, buttons, modal, notes, keyboard, storage }
}

function slideImage(name, note) {
  const image = element({ src: `http://127.0.0.1:4173/generated/lecture-a/${name}.png` })
  image.parentElement = { insertBefore(button) { image.launch = button } }
  image.closest = () => ({ cloneNode: () => ({ childNodes: [{ textContent: note }], querySelectorAll: () => [] }) })
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
