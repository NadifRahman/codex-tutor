import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildBook } from '../tools/build-book.mjs'

test('builds local HTML and a search index from Markdown chapters', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-tutor-book-'))
  try {
    fs.mkdirSync(path.join(root, 'notes', 'chapters'), { recursive: true })
    fs.mkdirSync(path.join(root, 'tools', 'site'), { recursive: true })
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    fs.symlinkSync(path.join(process.cwd(), 'node_modules', 'katex'), path.join(root, 'node_modules', 'katex'), 'dir')
    fs.writeFileSync(path.join(root, 'notes', 'index.md'), '# Test Course\n')
    fs.writeFileSync(path.join(root, 'notes', 'guide.md'), '# Guide\n')
    fs.writeFileSync(path.join(root, 'notes', 'chapters', 'week-01.md'), '# Week 1\n\nCPU datapath $x + y$.\n')
    fs.copyFileSync(path.join(process.cwd(), 'tools', 'site', 'style.css'), path.join(root, 'tools', 'site', 'style.css'))
    fs.copyFileSync(path.join(process.cwd(), 'tools', 'site', 'book.js'), path.join(root, 'tools', 'site', 'book.js'))

    const result = buildBook(root)
    assert.equal(result.pages, 3)
    assert.ok(fs.existsSync(path.join(result.destination, 'chapters', 'week-01', 'index.html')))
    assert.match(fs.readFileSync(path.join(result.destination, 'search.json'), 'utf8'), /CPU datapath/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

