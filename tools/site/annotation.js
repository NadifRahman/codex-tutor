(() => {
  const clone = value => JSON.parse(JSON.stringify(value))
  const tools = [
    ['select', 'Select'], ['pen', 'Pen'], ['highlighter', 'Highlight'], ['eraser', 'Eraser'],
    ['line', 'Line'], ['arrow', 'Arrow'], ['rectangle', 'Rectangle'], ['ellipse', 'Ellipse'], ['text', 'Text']
  ]
  const shortcuts = { v: 'select', p: 'pen', h: 'highlighter', e: 'eraser', l: 'line', a: 'arrow', r: 'rectangle', o: 'ellipse', t: 'text' }
  const toolKeys = Object.fromEntries(Object.entries(shortcuts).map(([key, tool]) => [tool, key.toUpperCase()]))
  const preferencesKey = `course-tutor-annotation-settings:${document.currentScript?.dataset.courseId || location.pathname}`
  let modal, canvas, context, stage, status, colorInput, fillInput, fillEnabled, widthInput, opacityInput, pressureInput
  let notesPanel, notesContent, notesUpdate, notesToggle, activeSlideId, notesRequestToken = 0
  let sourceImage, documentState, slidePath, sourceElement, selected = -1, activeTool = 'pen', gesture = null, penActive = false
  let history = [], future = [], dirty = false, zoom = 1

  function savePreferences() {
    try {
      localStorage.setItem(preferencesKey, JSON.stringify({
        tool: activeTool, color: colorInput.value, fill: fillEnabled.checked, fillColor: fillInput.value,
        width: Number(widthInput.value), opacity: Number(opacityInput.value), pressure: pressureInput.checked
      }))
    } catch {}
  }
  function restorePreferences() {
    let saved
    try { saved = JSON.parse(localStorage.getItem(preferencesKey) || 'null') } catch { return }
    if (!saved || typeof saved !== 'object') return
    if (/^#[0-9a-f]{6}$/i.test(saved.color)) colorInput.value = saved.color
    if (/^#[0-9a-f]{6}$/i.test(saved.fillColor)) fillInput.value = saved.fillColor
    if (typeof saved.fill === 'boolean') fillEnabled.checked = saved.fill
    if (typeof saved.pressure === 'boolean') pressureInput.checked = saved.pressure
    if (Number.isFinite(saved.width) && saved.width >= 1 && saved.width <= 32) widthInput.value = saved.width
    if (Number.isFinite(saved.opacity) && saved.opacity >= .1 && saved.opacity <= 1) opacityInput.value = saved.opacity
    if (tools.some(([name]) => name === saved.tool)) setTool(saved.tool, false)
  }

  function id() { return `annotation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }
  function clamp(value, minimum = 0, maximum = 1) { return Math.min(maximum, Math.max(minimum, value)) }
  function minDimension() { return Math.min(canvas.width, canvas.height) }
  function selectedWidth() { return Number(widthInput.value) / minDimension() }
  function selectedOpacity() { return Number(opacityInput.value) }
  function pointFromEvent(event) {
    const box = canvas.getBoundingClientRect()
    return {
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
      pressure: event.pointerType === 'pen' && pressureInput.checked ? clamp(event.pressure || .5, .05, 1) : 1
    }
  }
  function strokeStyle(object) {
    context.strokeStyle = object.color
    context.fillStyle = object.color
    context.globalAlpha = object.opacity
    context.lineWidth = Math.max(1, object.width * minDimension())
    context.lineCap = 'round'
    context.lineJoin = 'round'
  }
  function drawStroke(object) {
    if (object.points.length === 1) {
      const point = object.points[0]
      const pressure = object.pressureEnabled ? Math.max(.15, point.pressure) : 1
      context.beginPath()
      context.arc(point.x * canvas.width, point.y * canvas.height, context.lineWidth * pressure / 2, 0, Math.PI * 2)
      context.fill()
      return
    }
    for (let index = 1; index < object.points.length; index += 1) {
      const start = object.points[index - 1]
      const end = object.points[index]
      const pressure = object.pressureEnabled ? Math.max(.15, (start.pressure + end.pressure) / 2) : 1
      context.lineWidth = Math.max(1, object.width * minDimension() * pressure)
      context.beginPath()
      context.moveTo(start.x * canvas.width, start.y * canvas.height)
      context.lineTo(end.x * canvas.width, end.y * canvas.height)
      context.stroke()
    }
  }
  function drawArrowHead(x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const size = Math.max(10, context.lineWidth * 4)
    context.beginPath()
    context.moveTo(x2, y2)
    context.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6))
    context.moveTo(x2, y2)
    context.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6))
    context.stroke()
  }
  function drawShape(object) {
    const x1 = object.x1 * canvas.width, y1 = object.y1 * canvas.height
    const x2 = object.x2 * canvas.width, y2 = object.y2 * canvas.height
    const left = Math.min(x1, x2), top = Math.min(y1, y2), width = Math.abs(x2 - x1), height = Math.abs(y2 - y1)
    context.beginPath()
    if (object.type === 'line' || object.type === 'arrow') { context.moveTo(x1, y1); context.lineTo(x2, y2) }
    else if (object.type === 'rectangle') context.rect(left, top, width, height)
    else context.ellipse(left + width / 2, top + height / 2, Math.max(1, width / 2), Math.max(1, height / 2), 0, 0, Math.PI * 2)
    if (object.fill && !['line', 'arrow'].includes(object.type)) {
      const alpha = context.globalAlpha
      context.globalAlpha = object.fillOpacity
      context.fillStyle = object.fill
      context.fill()
      context.globalAlpha = alpha
    }
    context.stroke()
    if (object.type === 'arrow') drawArrowHead(x1, y1, x2, y2)
  }
  function drawText(object) {
    const fontSize = Math.max(10, object.fontSize * canvas.height)
    context.font = `${fontSize}px sans-serif`
    context.textBaseline = 'top'
    object.text.split(/\r?\n/).forEach((line, index) => context.fillText(line, object.x * canvas.width, object.y * canvas.height + index * fontSize * 1.2))
  }
  function bounds(object) {
    if (object.type === 'stroke') {
      const xs = object.points.map(point => point.x), ys = object.points.map(point => point.y)
      return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
    }
    if (object.type === 'text') {
      const width = Math.max(.04, object.text.length * object.fontSize * .55)
      const height = Math.max(object.fontSize, object.text.split(/\r?\n/).length * object.fontSize * 1.2)
      return { left: object.x, top: object.y, right: clamp(object.x + width), bottom: clamp(object.y + height) }
    }
    return { left: Math.min(object.x1, object.x2), top: Math.min(object.y1, object.y2), right: Math.max(object.x1, object.x2), bottom: Math.max(object.y1, object.y2) }
  }
  function render() {
    if (!context || !sourceImage) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.globalAlpha = 1
    context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height)
    documentState.objects.forEach((object, index) => {
      context.save()
      strokeStyle(object)
      if (object.type === 'stroke') drawStroke(object)
      else if (object.type === 'text') drawText(object)
      else drawShape(object)
      context.restore()
      if (index === selected) {
        const box = bounds(object)
        context.save()
        context.globalAlpha = 1
        context.strokeStyle = '#2563eb'
        context.fillStyle = '#fff'
        context.lineWidth = Math.max(1, 2 / zoom)
        context.setLineDash([8 / zoom, 5 / zoom])
        context.strokeRect(box.left * canvas.width, box.top * canvas.height, (box.right - box.left) * canvas.width, (box.bottom - box.top) * canvas.height)
        context.setLineDash([])
        const size = 12 / zoom
        context.fillRect(box.right * canvas.width - size / 2, box.bottom * canvas.height - size / 2, size, size)
        context.strokeRect(box.right * canvas.width - size / 2, box.bottom * canvas.height - size / 2, size, size)
        context.restore()
      }
    })
  }
  function checkpoint() {
    history.push(clone(documentState.objects))
    if (history.length > 100) history.shift()
    future = []
    dirty = true
  }
  function undo() {
    if (!history.length) return
    future.push(clone(documentState.objects))
    documentState.objects = history.pop()
    selected = -1
    dirty = true
    render()
  }
  function redo() {
    if (!future.length) return
    history.push(clone(documentState.objects))
    documentState.objects = future.pop()
    selected = -1
    dirty = true
    render()
  }
  function hitTest(point) {
    const padding = 12 / Math.max(canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height)
    for (let index = documentState.objects.length - 1; index >= 0; index -= 1) {
      const box = bounds(documentState.objects[index])
      if (point.x >= box.left - padding && point.x <= box.right + padding && point.y >= box.top - padding && point.y <= box.bottom + padding) return index
    }
    return -1
  }
  function isResizeHandle(point, object) {
    const box = bounds(object)
    const padding = 16 / Math.max(canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height)
    return Math.abs(point.x - box.right) <= padding && Math.abs(point.y - box.bottom) <= padding
  }
  function moveObject(object, original, dx, dy) {
    if (object.type === 'stroke') object.points = original.points.map(point => ({ ...point, x: clamp(point.x + dx), y: clamp(point.y + dy) }))
    else if (object.type === 'text') { object.x = clamp(original.x + dx); object.y = clamp(original.y + dy) }
    else {
      object.x1 = clamp(original.x1 + dx); object.y1 = clamp(original.y1 + dy)
      object.x2 = clamp(original.x2 + dx); object.y2 = clamp(original.y2 + dy)
    }
  }
  function resizeObject(object, original, point) {
    const old = bounds(original)
    const oldWidth = Math.max(.001, old.right - old.left), oldHeight = Math.max(.001, old.bottom - old.top)
    const newWidth = Math.max(.001, point.x - old.left), newHeight = Math.max(.001, point.y - old.top)
    if (object.type === 'stroke') object.points = original.points.map(item => ({ ...item, x: clamp(old.left + (item.x - old.left) * newWidth / oldWidth), y: clamp(old.top + (item.y - old.top) * newHeight / oldHeight) }))
    else if (object.type === 'text') object.fontSize = clamp(original.fontSize * Math.max(newWidth / oldWidth, newHeight / oldHeight), .008, .2)
    else { object.x2 = clamp(point.x); object.y2 = clamp(point.y) }
  }
  function makeCommon(type) {
    return { id: id(), type, color: colorInput.value, width: selectedWidth(), opacity: selectedOpacity(), note: '' }
  }
  function pointerDown(event) {
    if (event.pointerType === 'touch' && penActive) return
    if (event.pointerType === 'pen') penActive = true
    canvas.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)
    status.textContent = `Input: ${event.pointerType === 'pen' ? 'pen/stylus' : event.pointerType}; pressure ${Math.round((event.pressure || 0) * 100)}%`
    if (activeTool === 'select') {
      const hit = hitTest(point)
      selected = hit
      if (hit >= 0) {
        checkpoint()
        gesture = { kind: isResizeHandle(point, documentState.objects[hit]) ? 'resize' : 'move', start: point, original: clone(documentState.objects[hit]), index: hit }
      }
      render()
      return
    }
    if (activeTool === 'eraser') {
      const hit = hitTest(point)
      if (hit >= 0) { checkpoint(); documentState.objects.splice(hit, 1); selected = -1; render() }
      return
    }
    if (activeTool === 'text') {
      const text = window.prompt('Text to place on the slide:')
      if (text) {
        checkpoint()
        documentState.objects.push({ ...makeCommon('text'), x: point.x, y: point.y, text, fontSize: Math.max(.02, selectedWidth() * 5), fontFamily: 'sans-serif' })
        selected = documentState.objects.length - 1
        render()
      }
      return
    }
    checkpoint()
    if (activeTool === 'pen' || activeTool === 'highlighter') {
      const object = { ...makeCommon('stroke'), tool: activeTool, pressureEnabled: pressureInput.checked, points: [point] }
      if (activeTool === 'highlighter') object.opacity = Math.min(object.opacity, .38)
      documentState.objects.push(object)
    } else {
      documentState.objects.push({ ...makeCommon(activeTool), x1: point.x, y1: point.y, x2: point.x, y2: point.y, fill: fillEnabled.checked ? fillInput.value : null, fillOpacity: Math.min(selectedOpacity(), .35) })
    }
    selected = documentState.objects.length - 1
    gesture = { kind: 'draw', index: selected }
    render()
  }
  function pointerMove(event) {
    if (event.pointerType === 'pen') status.textContent = `Input: pen/stylus; pressure ${Math.round((event.pressure || 0) * 100)}%`
    if (!gesture) return
    const point = pointFromEvent(event)
    const object = documentState.objects[gesture.index]
    if (!object) return
    if (gesture.kind === 'move') moveObject(object, gesture.original, point.x - gesture.start.x, point.y - gesture.start.y)
    else if (gesture.kind === 'resize') resizeObject(object, gesture.original, point)
    else if (object.type === 'stroke') {
      const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event]
      for (const sample of events) object.points.push(pointFromEvent(sample))
    } else { object.x2 = point.x; object.y2 = point.y }
    render()
  }
  function pointerUp(event) {
    gesture = null
    if (event.pointerType === 'pen') penActive = false
    try { canvas.releasePointerCapture(event.pointerId) } catch {}
    saveDraft()
  }
  function setTool(tool, persist = true) {
    activeTool = tool
    canvas.dataset.tool = tool
    modal.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)))
    if (tool === 'highlighter') opacityInput.value = Math.min(Number(opacityInput.value), .38)
    if (persist) savePreferences()
  }
  function showSlideNotes(section, missingMessage = 'No slide notes are available for this image.') {
    notesContent.replaceChildren()
    if (!section) {
      notesContent.textContent = missingMessage
      return
    }
    const copy = section.cloneNode(true)
    copy.querySelectorAll('img, .annotation-launch, .slide-anchor, button, input, select, textarea, form, iframe, script').forEach(element => element.remove())
    copy.querySelectorAll('p').forEach(element => {
      if (!element.textContent.trim() && !element.children.length) element.remove()
    })
    notesContent.append(...copy.childNodes)
    if (!notesContent.textContent.trim()) notesContent.textContent = 'No slide notes have been written yet.'
  }
  async function refreshSlideNotes() {
    if (modal.hidden || !activeSlideId) return
    const token = ++notesRequestToken
    const slideId = activeSlideId
    try {
      const response = await fetch(`${location.pathname}${location.search}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not fetch the rebuilt chapter')
      const page = new DOMParser().parseFromString(await response.text(), 'text/html')
      const section = [...page.querySelectorAll('.book-slide')].find(item => item.dataset.slideId === slideId)
      if (token !== notesRequestToken || modal.hidden || activeSlideId !== slideId) return
      const scrollTop = notesPanel.scrollTop
      showSlideNotes(section, 'This slide is no longer in the rebuilt book.')
      notesPanel.scrollTop = scrollTop
      notesUpdate.hidden = true
    } catch {
      if (token !== notesRequestToken || modal.hidden || activeSlideId !== slideId) return
      notesUpdate.textContent = 'Could not refresh slide notes. Showing the previous version.'
      notesUpdate.hidden = false
    }
  }
  function setZoom(value) {
    zoom = clamp(value, .15, 3)
    canvas.style.width = `${canvas.width * zoom}px`
    canvas.style.height = `${canvas.height * zoom}px`
    render()
  }
  function fitCanvas() {
    const availableWidth = Math.max(200, stage.clientWidth - 32)
    const availableHeight = Math.max(150, stage.clientHeight - 32)
    setZoom(Math.min(1, availableWidth / canvas.width, availableHeight / canvas.height))
  }
  function draftKey() { return `course-tutor-annotation:${slidePath}` }
  function saveDraft() {
    if (!dirty || !documentState) return
    try { localStorage.setItem(draftKey(), JSON.stringify({ baseHash: documentState.baseHash, objects: documentState.objects })) } catch {}
  }
  async function save() {
    const button = modal.querySelector('.annotation-save')
    button.disabled = true
    status.textContent = 'Saving full-resolution annotated PNG...'
    try {
      const response = await fetch('/__annotations/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...documentState, slide: slidePath })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save annotations')
      documentState = result
      dirty = false
      try { localStorage.removeItem(draftKey()) } catch {}
      status.textContent = 'Saved. The live book is rebuilding...'
      sourceElement.src = `${sourceElement.src.split('?')[0]}?annotation=${Date.now()}`
      window.setTimeout(() => closeEditor(true), 350)
    } catch (error) { status.textContent = error.message }
    finally { button.disabled = false }
  }
  function closeEditor(force = false) {
    if (!force && dirty && !window.confirm('Close without saving these annotation changes? A local draft will be retained.')) return
    saveDraft()
    modal.hidden = true
    notesRequestToken += 1
    activeSlideId = null
    document.body.style.overflow = ''
    gesture = null
    document.dispatchEvent(new Event('annotation-editor-closed'))
  }
  function updateSelectedStyle() {
    if (selected < 0) return
    checkpoint()
    const object = documentState.objects[selected]
    object.color = colorInput.value
    object.width = selectedWidth()
    object.opacity = selectedOpacity()
    if (!['stroke', 'line', 'arrow', 'text'].includes(object.type)) {
      object.fill = fillEnabled.checked ? fillInput.value : null
      object.fillOpacity = Math.min(selectedOpacity(), .35)
    }
    render()
  }
  function createModal() {
    modal = document.createElement('div')
    modal.className = 'annotation-modal'
    modal.hidden = true
    modal.innerHTML = `<div class="annotation-toolbar">
      <div class="annotation-tools">${tools.map(([name, label]) => `<button type="button" data-tool="${name}" aria-pressed="${name === 'pen'}">${label} <kbd>${toolKeys[name]}</kbd></button>`).join('')}</div>
      <label>Colour <input class="annotation-color" type="color" value="#e53935"></label>
      <label><input class="annotation-fill-enabled" type="checkbox"> Fill</label>
      <label>Fill colour <input class="annotation-fill" type="color" value="#fff176"></label>
      <label>Thickness <input class="annotation-width" type="range" min="1" max="32" value="5"></label>
      <label>Opacity <input class="annotation-opacity" type="range" min="0.1" max="1" step="0.05" value="1"></label>
      <label><input class="annotation-pressure" type="checkbox" checked> Pressure</label>
      <button type="button" data-action="note">Attach note</button>
      <button type="button" data-action="undo">Undo</button><button type="button" data-action="redo">Redo</button>
      <button type="button" data-action="zoom-out">-</button><button type="button" data-action="fit">Fit</button><button type="button" data-action="zoom-in">+</button>
      <button type="button" data-action="clear" class="annotation-danger">Clear all</button>
      <button type="button" class="annotation-notes-toggle" aria-controls="annotation-slide-notes" aria-expanded="false">Slide notes</button>
    </div><div class="annotation-workspace"><div class="annotation-stage"><canvas class="annotation-canvas" data-tool="pen"></canvas></div>
      <aside class="annotation-notes" id="annotation-slide-notes" aria-label="Slide notes"><h2>Slide notes</h2><p class="annotation-notes-update" role="status" hidden></p><div class="annotation-notes-content"></div></aside></div>
    <div class="annotation-footer"><span class="annotation-status">Ready</span><span class="annotation-shortcuts">Shortcuts: <kbd>Ctrl/⌘ S</kbd> Save · <kbd>Ctrl/⌘ Z</kbd> Undo · <kbd>Ctrl/⌘ Shift Z</kbd> Redo · <kbd>Del</kbd> Delete selected · <kbd>Esc</kbd> Close</span><div class="annotation-actions"><button type="button" data-action="cancel">Cancel</button><button type="button" class="annotation-save" data-action="save">Save</button></div></div>`
    document.body.append(modal)
    canvas = modal.querySelector('canvas'); context = canvas.getContext('2d'); stage = modal.querySelector('.annotation-stage'); status = modal.querySelector('.annotation-status')
    colorInput = modal.querySelector('.annotation-color'); fillInput = modal.querySelector('.annotation-fill'); fillEnabled = modal.querySelector('.annotation-fill-enabled')
    widthInput = modal.querySelector('.annotation-width'); opacityInput = modal.querySelector('.annotation-opacity'); pressureInput = modal.querySelector('.annotation-pressure')
    notesPanel = modal.querySelector('.annotation-notes'); notesContent = modal.querySelector('.annotation-notes-content')
    notesUpdate = modal.querySelector('.annotation-notes-update'); notesToggle = modal.querySelector('.annotation-notes-toggle')
    notesToggle.addEventListener('click', () => {
      modal.dataset.notesOpen = String(modal.dataset.notesOpen !== 'true')
      notesToggle.setAttribute('aria-expanded', modal.dataset.notesOpen)
    })
    modal.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)))
    modal.querySelector('[data-action="undo"]').addEventListener('click', undo)
    modal.querySelector('[data-action="redo"]').addEventListener('click', redo)
    modal.querySelector('[data-action="zoom-in"]').addEventListener('click', () => setZoom(zoom * 1.2))
    modal.querySelector('[data-action="zoom-out"]').addEventListener('click', () => setZoom(zoom / 1.2))
    modal.querySelector('[data-action="fit"]').addEventListener('click', fitCanvas)
    modal.querySelector('[data-action="clear"]').addEventListener('click', () => { if (documentState.objects.length && window.confirm('Remove every annotation from this slide?')) { checkpoint(); documentState.objects = []; selected = -1; render() } })
    modal.querySelector('[data-action="note"]').addEventListener('click', () => {
      if (selected < 0) { status.textContent = 'Select an annotation before attaching a note.'; return }
      const note = window.prompt('Optional note for ChatGPT/Codex:', documentState.objects[selected].note || '')
      if (note !== null) { checkpoint(); documentState.objects[selected].note = note; render() }
    })
    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => closeEditor())
    modal.querySelector('[data-action="save"]').addEventListener('click', save)
    for (const input of [colorInput, fillInput, fillEnabled, widthInput, opacityInput]) input.addEventListener('change', updateSelectedStyle)
    for (const input of [colorInput, fillInput, fillEnabled, widthInput, opacityInput, pressureInput]) {
      input.addEventListener('input', savePreferences)
      input.addEventListener('change', savePreferences)
    }
    restorePreferences()
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', pointerUp)
  }
  async function openEditor(image, slide) {
    sourceElement = image; slidePath = slide
    notesRequestToken += 1
    activeSlideId = image.closest('.book-slide')?.dataset.slideId
    notesPanel.scrollTop = 0
    notesUpdate.hidden = true
    showSlideNotes(image.closest('.book-slide'))
    modal.dataset.notesOpen = 'false'
    notesToggle.setAttribute('aria-expanded', 'false')
    status.textContent = 'Loading clean slide and editable annotations...'
    modal.hidden = false
    document.body.style.overflow = 'hidden'
    try {
      const response = await fetch(`/__annotations/state?slide=${encodeURIComponent(slide)}`)
      const state = await response.json()
      if (!response.ok) throw new Error(state.error || 'Could not load annotations')
      documentState = state
      const draft = localStorage.getItem(draftKey())
      if (draft) {
        try {
          const parsed = JSON.parse(draft)
          if (parsed.baseHash === state.baseHash && window.confirm('Restore the unsaved annotation draft for this slide?')) documentState.objects = parsed.objects
        } catch {}
      }
      sourceImage = new Image()
      sourceImage.src = `/__annotations/base?slide=${encodeURIComponent(slide)}&v=${encodeURIComponent(state.baseHash)}`
      await sourceImage.decode()
      canvas.width = state.width; canvas.height = state.height
      history = []; future = []; selected = -1; dirty = false
      fitCanvas(); render()
      status.textContent = state.needsReview
        ? 'Warning: the source slide changed. Review annotation alignment, then Save to confirm it.'
        : 'Ready. Pen pressure will appear here when detected.'
    } catch (error) { status.textContent = error.message }
  }
  function slidePathFor(image) {
    try {
      const pathname = new URL(image.src, location.href).pathname
      const index = pathname.indexOf('/generated/')
      return index >= 0 ? pathname.slice(index + 1) : null
    } catch { return null }
  }
  function enhanceSlides() {
    document.querySelectorAll('main img').forEach(image => {
      if (image.dataset.annotationReady) return
      const slide = slidePathFor(image)
      if (!slide || !/\/slide-\d+\.png$/i.test(slide)) return
      image.dataset.annotationReady = 'true'
      const button = document.createElement('button')
      button.type = 'button'; button.className = 'annotation-launch'; button.textContent = 'Annotate slide'
      button.addEventListener('click', () => openEditor(image, slide))
      image.parentElement.insertBefore(button, image)
    })
  }
  function keyboard(event) {
    if (!modal || modal.hidden) return
    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && key === 's') { event.preventDefault(); save(); return }
    if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return }
    if (event.key === 'Escape') { closeEditor(); return }
    if (event.target?.closest?.('input, textarea, select, button, a, summary, [contenteditable]')) return
    if (event.key === 'Delete' && selected >= 0) { checkpoint(); documentState.objects.splice(selected, 1); selected = -1; render(); return }
    if (!event.ctrlKey && !event.metaKey && shortcuts[key]) setTool(shortcuts[key])
  }
  createModal()
  enhanceSlides()
  document.addEventListener('keydown', keyboard)
  document.addEventListener('course-book-rebuilt', () => { void refreshSlideNotes() })
})()
