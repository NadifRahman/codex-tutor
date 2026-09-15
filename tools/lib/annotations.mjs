import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const slidePattern = /^generated\/([a-zA-Z0-9][a-zA-Z0-9_-]*)\/(slide-\d+\.png)$/
const objectTypes = new Set(['stroke', 'line', 'arrow', 'rectangle', 'ellipse', 'text'])
const colorPattern = /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)$/i

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function atomicWrite(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  const backup = `${temporary}.bak`
  fs.writeFileSync(temporary, contents)
  if (!fs.existsSync(filePath)) {
    fs.renameSync(temporary, filePath)
    return
  }
  fs.renameSync(filePath, backup)
  try {
    fs.renameSync(temporary, filePath)
    fs.unlinkSync(backup)
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    if (!fs.existsSync(filePath) && fs.existsSync(backup)) fs.renameSync(backup, filePath)
    throw error
  }
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, finite(value)))
}

function color(value, fallback = '#e53935') {
  return typeof value === 'string' && colorPattern.test(value) ? value : fallback
}

function point(value = {}) {
  return {
    x: clamp(value.x),
    y: clamp(value.y),
    pressure: clamp(value.pressure, 0, 1)
  }
}

function normalizeObject(value, index) {
  if (!value || typeof value !== 'object' || !objectTypes.has(value.type)) {
    throw new Error(`Invalid annotation object at index ${index}`)
  }
  const common = {
    id: typeof value.id === 'string' && value.id.length <= 100 ? value.id : `object-${index + 1}`,
    type: value.type,
    color: color(value.color),
    width: clamp(value.width, 0.0005, 0.08),
    opacity: clamp(value.opacity ?? 1),
    note: typeof value.note === 'string' ? value.note.slice(0, 4000) : ''
  }
  if (value.type === 'stroke') {
    const points = Array.isArray(value.points) ? value.points.slice(0, 20000).map(point) : []
    if (points.length < 1) throw new Error(`Stroke ${common.id} has no points`)
    return { ...common, tool: value.tool === 'highlighter' ? 'highlighter' : 'pen', pressureEnabled: value.pressureEnabled !== false, points }
  }
  if (value.type === 'text') {
    return {
      ...common,
      x: clamp(value.x), y: clamp(value.y),
      text: String(value.text ?? '').slice(0, 4000),
      fontSize: clamp(value.fontSize ?? 0.035, 0.008, 0.2),
      fontFamily: 'sans-serif'
    }
  }
  const shape = {
    ...common,
    x1: clamp(value.x1), y1: clamp(value.y1),
    x2: clamp(value.x2), y2: clamp(value.y2),
    fill: value.fill ? color(value.fill, 'transparent') : null,
    fillOpacity: clamp(value.fillOpacity ?? 0.18)
  }
  return shape
}

export function normalizeAnnotationDocument(value, expectedHash) {
  if (!value || typeof value !== 'object') throw new Error('Annotation document must be an object')
  if (value.version !== 1) throw new Error('Unsupported annotation document version')
  if (expectedHash && value.baseHash !== expectedHash) {
    const error = new Error('The clean slide changed while the annotation editor was open. Reopen the editor and review the annotations before saving.')
    error.code = 'STALE_BASE'
    throw error
  }
  const objects = Array.isArray(value.objects) ? value.objects.slice(0, 5000).map(normalizeObject) : []
  return {
    version: 1,
    baseHash: String(value.baseHash ?? ''),
    width: Math.max(1, Math.round(finite(value.width, 1))),
    height: Math.max(1, Math.round(finite(value.height, 1))),
    needsReview: Boolean(value.needsReview),
    previousBaseHash: typeof value.previousBaseHash === 'string' ? value.previousBaseHash : null,
    objects
  }
}

export function resolveAnnotationPaths(root, slide) {
  const normalized = String(slide ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const match = normalized.match(slidePattern)
  if (!match) throw new Error('Slide must be a generated PNG path')
  const [, sourceId, fileName] = match
  return {
    slide: normalized,
    sourceId,
    fileName,
    publicPath: path.join(root, 'notes', 'public', 'generated', sourceId, fileName),
    basePath: path.join(root, '.study-cache', 'sources', sourceId, 'base', fileName),
    annotationPath: path.join(root, 'notes', 'annotations', sourceId, fileName.replace(/\.png$/i, '.json'))
  }
}

export function ensureCleanBase(root, slide) {
  const paths = resolveAnnotationPaths(root, slide)
  if (!fs.existsSync(paths.basePath)) {
    if (!fs.existsSync(paths.publicPath)) throw new Error('Slide image does not exist')
    fs.mkdirSync(path.dirname(paths.basePath), { recursive: true })
    fs.copyFileSync(paths.publicPath, paths.basePath)
  }
  return paths
}

function applyStyle(context, object, width, height) {
  context.strokeStyle = object.color
  context.lineWidth = Math.max(1, object.width * Math.min(width, height))
  context.globalAlpha = object.opacity
  context.lineCap = 'round'
  context.lineJoin = 'round'
}

function drawStroke(context, object, width, height) {
  const points = object.points
  if (points.length === 1) {
    const pressure = object.pressureEnabled ? Math.max(0.15, points[0].pressure) : 1
    context.beginPath()
    context.arc(points[0].x * width, points[0].y * height, context.lineWidth * pressure / 2, 0, Math.PI * 2)
    context.fillStyle = object.color
    context.fill()
    return
  }
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const pressure = object.pressureEnabled ? Math.max(0.15, (start.pressure + end.pressure) / 2) : 1
    context.lineWidth = Math.max(1, object.width * Math.min(width, height) * pressure)
    context.beginPath()
    context.moveTo(start.x * width, start.y * height)
    context.lineTo(end.x * width, end.y * height)
    context.stroke()
  }
}

function drawArrowHead(context, x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = Math.max(10, context.lineWidth * 4)
  context.beginPath()
  context.moveTo(x2, y2)
  context.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6))
  context.moveTo(x2, y2)
  context.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6))
  context.stroke()
}

function drawShape(context, object, width, height) {
  const x1 = object.x1 * width
  const y1 = object.y1 * height
  const x2 = object.x2 * width
  const y2 = object.y2 * height
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const shapeWidth = Math.abs(x2 - x1)
  const shapeHeight = Math.abs(y2 - y1)
  context.beginPath()
  if (object.type === 'line' || object.type === 'arrow') {
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
  } else if (object.type === 'rectangle') {
    context.rect(left, top, shapeWidth, shapeHeight)
  } else if (object.type === 'ellipse') {
    context.ellipse(left + shapeWidth / 2, top + shapeHeight / 2, Math.max(1, shapeWidth / 2), Math.max(1, shapeHeight / 2), 0, 0, Math.PI * 2)
  }
  if (object.fill && !['line', 'arrow'].includes(object.type)) {
    const alpha = context.globalAlpha
    context.globalAlpha = object.fillOpacity
    context.fillStyle = object.fill
    context.fill()
    context.globalAlpha = alpha
  }
  context.stroke()
  if (object.type === 'arrow') drawArrowHead(context, x1, y1, x2, y2)
}

function drawText(context, object, width, height) {
  const fontSize = Math.max(10, object.fontSize * height)
  context.fillStyle = object.color
  context.font = `${fontSize}px sans-serif`
  context.textBaseline = 'top'
  const lines = object.text.split(/\r?\n/)
  lines.forEach((line, index) => context.fillText(line, object.x * width, object.y * height + index * fontSize * 1.2))
}

export async function composeAnnotatedSlide({ basePath, outputPath, document }) {
  const image = await loadImage(basePath)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  for (const object of document.objects) {
    context.save()
    applyStyle(context, object, image.width, image.height)
    if (object.type === 'stroke') drawStroke(context, object, image.width, image.height)
    else if (object.type === 'text') drawText(context, object, image.width, image.height)
    else drawShape(context, object, image.width, image.height)
    context.restore()
  }
  atomicWrite(outputPath, canvas.toBuffer('image/png'))
  return { width: image.width, height: image.height }
}

export async function readAnnotationState(root, slide) {
  const paths = ensureCleanBase(root, slide)
  const base = fs.readFileSync(paths.basePath)
  const image = await loadImage(base)
  const baseHash = sha256(base)
  let document = { version: 1, baseHash, width: image.width, height: image.height, objects: [] }
  if (fs.existsSync(paths.annotationPath)) {
    const stored = JSON.parse(fs.readFileSync(paths.annotationPath, 'utf8'))
    const baseChanged = Boolean(stored.baseHash && stored.baseHash !== baseHash)
    document = normalizeAnnotationDocument({
      ...stored, baseHash, width: image.width, height: image.height,
      needsReview: stored.needsReview || baseChanged,
      previousBaseHash: baseChanged ? stored.baseHash : stored.previousBaseHash
    })
  }
  return { ...document, slide: paths.slide }
}

export async function saveAnnotations(root, slide, value) {
  const paths = ensureCleanBase(root, slide)
  const base = fs.readFileSync(paths.basePath)
  const baseHash = sha256(base)
  const image = await loadImage(base)
  const document = normalizeAnnotationDocument({ ...value, width: image.width, height: image.height }, baseHash)
  document.needsReview = false
  document.previousBaseHash = null
  if (document.objects.length === 0) {
    if (fs.existsSync(paths.annotationPath)) fs.unlinkSync(paths.annotationPath)
    atomicWrite(paths.publicPath, base)
  } else {
    atomicWrite(paths.annotationPath, `${JSON.stringify(document, null, 2)}\n`)
    await composeAnnotatedSlide({ basePath: paths.basePath, outputPath: paths.publicPath, document })
  }
  return { ...document, slide: paths.slide }
}

export async function applyStoredAnnotations(root, slide) {
  const paths = ensureCleanBase(root, slide)
  if (!fs.existsSync(paths.annotationPath)) {
    atomicWrite(paths.publicPath, fs.readFileSync(paths.basePath))
    return readAnnotationState(root, slide)
  }
  const base = fs.readFileSync(paths.basePath)
  const image = await loadImage(base)
  const stored = JSON.parse(fs.readFileSync(paths.annotationPath, 'utf8'))
  const baseHash = sha256(base)
  const baseChanged = Boolean(stored.baseHash && stored.baseHash !== baseHash)
  const document = normalizeAnnotationDocument({
    ...stored,
    baseHash,
    width: image.width,
    height: image.height,
    needsReview: stored.needsReview || baseChanged,
    previousBaseHash: baseChanged ? stored.baseHash : stored.previousBaseHash
  })
  atomicWrite(paths.annotationPath, `${JSON.stringify(document, null, 2)}\n`)
  await composeAnnotatedSlide({ basePath: paths.basePath, outputPath: paths.publicPath, document })
  return { ...document, slide: paths.slide }
}
