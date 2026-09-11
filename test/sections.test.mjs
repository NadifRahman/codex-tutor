import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import { sectionPages, validateSections } from '../tools/lib/sections.mjs'
import { assembleChapters } from '../tools/assemble-chapters.mjs'

test('repository includes a valid section state file', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const statePath = path.join(root, 'study-data', 'sections.yml')
  assert.equal(fs.existsSync(statePath), true)
  const state = YAML.parse(fs.readFileSync(statePath, 'utf8'))
  assert.equal(state?.version, 1)
  assert.ok(state?.active_section === null || typeof state?.active_section === 'string')
  assert.ok(state?.sections && typeof state.sections === 'object' && !Array.isArray(state.sections))
})

test('sections retain authored content through assembly and validate independent resume state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-sections-'))
  try {
    const write = (name, text) => {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
      fs.writeFileSync(path.join(root, name), text)
    }
    assert.deepEqual(sectionPages(root), [])
    assert.deepEqual(validateSections(root), [])
    const note = '# Review\n<!-- personal:start -->\nKeep exactly.\n<!-- personal:end -->\n'
    write('notes/sections/review/index.md', note)
    write('notes/slides/week-01/lecture/slide-001.md', '# Slide 1\nExplanation\n')
    const weekly = 'checkpoint:\n  week: 1\n  slide_id: lecture-slide-001\n'
    write('study-data/progress.yml', weekly)
    write('study-data/sections.yml', 'version: 1\nactive_section: review\nsections:\n  review:\n    title: Review\n    page: notes/sections/review/index.md\n    source_ids: []\n    questions_to_revisit: []\n')
    assert.deepEqual(validateSections(root), [])
    assembleChapters(root)
    assert.equal(fs.readFileSync(path.join(root, 'notes/sections/review/index.md'), 'utf8'), note)
    assert.equal(fs.readFileSync(path.join(root, 'study-data/progress.yml'), 'utf8'), weekly)
    write('notes/sections/review.md', note)
    assert.throws(() => sectionPages(root), /Duplicate/)
    fs.unlinkSync(path.join(root, 'notes/sections/review.md'))
    write('notes/sections/review/index.md', '# Broken markers\n')
    assert.ok(validateSections(root).some(error => error.includes('markers')))
    fs.unlinkSync(path.join(root, 'notes/sections/review/index.md'))
    assert.ok(validateSections(root).some(error => error.includes('existing section page')))
    write('study-data/sections.yml', 'version: 1\nactive_section: missing\nsections: {}\n')
    assert.ok(validateSections(root).some(error => error.includes('unknown section')))
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
