import fs from 'node:fs'
import { validateSections } from './lib/sections.mjs'
import path from 'node:path'
import { listSources, readYaml, resolveRepoPath } from './lib/workspace.mjs'

const errors = []
const warnings = []
const allowedTypes = new Set(['lecture', 'transcript', 'textbook', 'assessment', 'assignment', 'lab', 'homework', 'outline', 'notes', 'web'])
const allowedSlideStates = new Set(['unseen', 'teaching', 'understood', 'review-needed'])
const allowedReviewPriorities = new Set(['low', 'normal', 'high', 'urgent'])
const course = readYaml('course.yml')
if (!course?.course?.code) errors.push('course.yml is missing course.code')
if (!course?.course?.title) errors.push('course.yml is missing course.title')

let sources = []
try {
  sources = listSources()
} catch (error) {
  errors.push(error.message)
}

for (const source of sources) {
  if (!allowedTypes.has(source.type)) errors.push(`${source.id} has unsupported type ${source.type}`)
  if (!source.title) errors.push(`${source.id} is missing title`)
  if (!source.path && !source.url) errors.push(`${source.id} needs path or url`)
  if (source.path) {
    const exists = fs.existsSync(resolveRepoPath(source.path))
    if (!exists && source.tracked === false) warnings.push(`local source is absent: ${source.id}`)
    if (!exists && source.tracked !== false) errors.push(`tracked source is absent: ${source.id}`)
  }
}

const sourceById = new Map(sources.map((source) => [source.id, source]))
let progress = {}
try {
  progress = readYaml('study-data/progress.yml')
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) throw new Error('study-data/progress.yml must contain a mapping')
} catch (error) {
  errors.push(error.message)
}

const slides = progress.slides ?? {}
if (!slides || typeof slides !== 'object' || Array.isArray(slides)) {
  errors.push('study-data/progress.yml slides must be a mapping')
} else {
  for (const [slideId, slide] of Object.entries(slides)) {
    if (!slide || typeof slide !== 'object' || Array.isArray(slide)) errors.push(`slide ${slideId} must be a mapping`)
    else if (!allowedSlideStates.has(slide.status)) errors.push(`slide ${slideId} has invalid status ${slide.status}`)
  }
}

const checkpoint = progress.checkpoint ?? {}
if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
  errors.push('study-data/progress.yml checkpoint must be a mapping')
} else {
  if (checkpoint.source_id !== null && checkpoint.source_id !== undefined && !sourceById.has(checkpoint.source_id)) errors.push(`checkpoint references unknown source ${checkpoint.source_id}`)
  if (checkpoint.slide_id !== null && checkpoint.slide_id !== undefined && !Object.hasOwn(slides, checkpoint.slide_id)) errors.push(`checkpoint references unknown slide ${checkpoint.slide_id}`)
  if (checkpoint.source_id && checkpoint.slide_id && !checkpoint.slide_id.startsWith(`${checkpoint.source_id}-slide-`)) errors.push('checkpoint slide does not belong to checkpoint source')
  if (checkpoint.week !== null && checkpoint.week !== undefined && (!Number.isInteger(Number(checkpoint.week)) || Number(checkpoint.week) < 1)) errors.push('checkpoint week must be a positive integer or null')
}

const concepts = progress.concepts ?? {}
if (!concepts || typeof concepts !== 'object' || Array.isArray(concepts)) {
  errors.push('study-data/progress.yml concepts must be a mapping')
} else {
  for (const [conceptId, concept] of Object.entries(concepts)) {
    if (!concept || typeof concept !== 'object' || Array.isArray(concept)) {
      errors.push(`concept ${conceptId} must be a mapping`)
      continue
    }
    if (!Number.isInteger(Number(concept.confidence)) || Number(concept.confidence) < 0 || Number(concept.confidence) > 3) errors.push(`concept ${conceptId} confidence must be an integer from 0 to 3`)
    if (!allowedReviewPriorities.has(concept.review_priority)) errors.push(`concept ${conceptId} has invalid review priority ${concept.review_priority}`)
    if (!Array.isArray(concept.related_slides) || concept.related_slides.some((slideId) => !Object.hasOwn(slides, slideId))) errors.push(`concept ${conceptId} must reference known slides`)
  }
}

for (const source of sources) {
  const manifestPath = resolveRepoPath(`.study-cache/sources/${source.id}/manifest.json`)
  if (!fs.existsSync(manifestPath)) continue
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const notes = manifest.notes_requiring_reconciliation
    if (Array.isArray(notes) && notes.length) warnings.push(`${source.id} changed after notes were written; reconcile ${notes.length} slide note${notes.length === 1 ? '' : 's'}`)
  } catch {
    warnings.push(`could not read preparation manifest for ${source.id}`)
  }
}

const notesRoot = resolveRepoPath('notes/slides')
if (fs.existsSync(notesRoot)) {
  const stack = [notesRoot]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(fullPath)
      else if (entry.name.endsWith('.md')) {
        const text = fs.readFileSync(fullPath, 'utf8')
        const starts = (text.match(/<!-- personal:start -->/g) ?? []).length
        const ends = (text.match(/<!-- personal:end -->/g) ?? []).length
        if (starts !== 1 || ends !== 1) errors.push(`${path.relative(process.cwd(), fullPath)} has invalid personal-note markers`)
      }
    }
  }
}

errors.push(...validateSections(process.cwd(), sources.map(source => source.id)))

for (const warning of warnings) console.warn(`warning: ${warning}`)
for (const error of errors) console.error(`error: ${error}`)
if (errors.length) process.exitCode = 1
else console.log(`valid workspace (${sources.length} sources, ${warnings.length} warnings)`)
