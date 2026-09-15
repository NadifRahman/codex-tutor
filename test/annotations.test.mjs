import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
  applyStoredAnnotations,
  normalizeAnnotationDocument,
  readAnnotationState,
  resolveAnnotationPaths,
  saveAnnotations
} from '../tools/lib/annotations.mjs'

function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex') }

function createSlide(root) {
  const paths = resolveAnnotationPaths(root, 'generated/lecture-a/slide-001.png')
  fs.mkdirSync(path.dirname(paths.publicPath), { recursive: true })
  const canvas = createCanvas(240, 120)
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#111827'
  context.fillRect(20, 20, 40, 40)
  fs.writeFileSync(paths.publicPath, canvas.toBuffer('image/png'))
  return paths
}

test('saves editable annotations and produces a flattened full-resolution PNG', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-annotations-'))
  try {
    const paths = createSlide(root)
    const clean = fs.readFileSync(paths.publicPath)
    const state = await readAnnotationState(root, 'generated/lecture-a/slide-001.png')
    assert.equal(state.width, 240)
    assert.equal(state.height, 120)
    assert.ok(fs.existsSync(paths.basePath))
    const saved = await saveAnnotations(root, state.slide, {
      ...state,
      objects: [
        { id: 'pen-1', type: 'stroke', tool: 'pen', color: '#e53935', width: .02, opacity: 1, pressureEnabled: true, points: [{ x: .1, y: .8, pressure: .4 }, { x: .9, y: .8, pressure: .9 }], note: 'Review this path' },
        { id: 'arrow-1', type: 'arrow', color: '#2563eb', width: .01, opacity: 1, x1: .2, y1: .2, x2: .8, y2: .5, fill: null },
        { id: 'box-1', type: 'rectangle', color: '#16a34a', width: .008, opacity: 1, x1: .5, y1: .1, x2: .95, y2: .6, fill: '#fff176', fillOpacity: .2 },
        { id: 'text-1', type: 'text', color: '#111827', width: .004, opacity: 1, x: .1, y: .05, text: 'Question', fontSize: .08 }
      ]
    })
    assert.equal(saved.objects.length, 4)
    assert.ok(fs.existsSync(paths.annotationPath))
    assert.notEqual(hash(fs.readFileSync(paths.publicPath)), hash(clean))
    const flattened = await loadImage(paths.publicPath)
    assert.equal(flattened.width, 240)
    assert.equal(flattened.height, 120)
    const stored = JSON.parse(fs.readFileSync(paths.annotationPath, 'utf8'))
    assert.equal(stored.objects[0].note, 'Review this path')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('rejects stale saves, reapplies sidecars, and restores the clean image when cleared', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-annotations-'))
  try {
    const paths = createSlide(root)
    const clean = fs.readFileSync(paths.publicPath)
    const state = await readAnnotationState(root, 'generated/lecture-a/slide-001.png')
    await assert.rejects(
      saveAnnotations(root, state.slide, { ...state, baseHash: 'stale', objects: [] }),
      error => error.code === 'STALE_BASE'
    )
    await saveAnnotations(root, state.slide, { ...state, objects: [{ id: 'line', type: 'line', color: '#f00', width: .01, opacity: 1, x1: .1, y1: .1, x2: .9, y2: .9 }] })
    fs.copyFileSync(paths.basePath, paths.publicPath)
    assert.equal(hash(fs.readFileSync(paths.publicPath)), hash(clean))
    await applyStoredAnnotations(root, state.slide)
    assert.notEqual(hash(fs.readFileSync(paths.publicPath)), hash(clean))
    await saveAnnotations(root, state.slide, { ...state, objects: [] })
    assert.equal(hash(fs.readFileSync(paths.publicPath)), hash(clean))
    assert.equal(fs.existsSync(paths.annotationPath), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('validates annotation paths and documents', () => {
  assert.throws(() => resolveAnnotationPaths('C:/tmp', '../secret.png'), /generated PNG/)
  assert.throws(() => normalizeAnnotationDocument({ version: 2 }), /Unsupported/)
  assert.throws(() => normalizeAnnotationDocument({ version: 1, objects: [{ type: 'video' }] }), /Invalid annotation object/)
})

test('marks annotations for review when a PDF re-render changes the clean slide', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-annotations-'))
  try {
    const paths = createSlide(root)
    const state = await readAnnotationState(root, 'generated/lecture-a/slide-001.png')
    await saveAnnotations(root, state.slide, { ...state, objects: [{ id: 'line', type: 'line', color: '#f00', width: .01, opacity: 1, x1: .1, y1: .1, x2: .9, y2: .9 }] })
    const changed = createCanvas(240, 120)
    changed.getContext('2d').fillStyle = '#f8fafc'
    changed.getContext('2d').fillRect(0, 0, 240, 120)
    fs.writeFileSync(paths.basePath, changed.toBuffer('image/png'))
    const reapplied = await applyStoredAnnotations(root, state.slide)
    assert.equal(reapplied.needsReview, true)
    assert.equal(JSON.parse(fs.readFileSync(paths.annotationPath, 'utf8')).needsReview, true)
    const confirmed = await saveAnnotations(root, state.slide, reapplied)
    assert.equal(confirmed.needsReview, false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
