import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { assembleChapters } from '../tools/assemble-chapters.mjs'

test('assembles per-slide notes into a continuous weekly chapter', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-tutor-chapter-'))
  try {
    const slideDir = path.join(root, 'notes', 'slides', 'week-01', 'lecture-a')
    fs.mkdirSync(slideDir, { recursive: true })
    fs.writeFileSync(path.join(slideDir, 'slide-001.md'), '---\npage: 1\n---\n\n# Slide 1\n\nFirst explanation.\n')
    fs.writeFileSync(path.join(slideDir, 'slide-002.md'), '---\npage: 2\n---\n\n# Slide 2\n\nSecond explanation.\n')

    const outputs = assembleChapters(root)
    assert.equal(outputs.length, 1)
    const chapter = fs.readFileSync(outputs[0], 'utf8')
    assert.match(chapter, /# Week 1/)
    assert.match(chapter, /### Slide 1/)
    assert.match(chapter, /Second explanation/)
    assert.ok(chapter.indexOf('First explanation') < chapter.indexOf('Second explanation'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

