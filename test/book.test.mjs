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
    fs.symlinkSync(path.join(process.cwd(), 'node_modules', 'katex'), path.join(root, 'node_modules', 'katex'), process.platform === 'win32' ? 'junction' : 'dir')
    fs.writeFileSync(path.join(root, 'notes', 'index.md'), '# Test Course\n')
    fs.writeFileSync(path.join(root, 'notes', 'guide.md'), '# Guide\n')
    fs.writeFileSync(path.join(root, 'notes', 'chapters', 'week-01.md'), '# Week 1\n\n## lecture-a\n\n<!-- search:start lecture-a-slide-001 -->\n<span id="lecture-a-slide-001" class="slide-anchor" aria-hidden="true"></span>\n\n### Slide 1\n\nCPU datapath $x + y$.\n<!-- search:end -->\n')
    fs.copyFileSync(path.join(process.cwd(), 'tools', 'site', 'style.css'), path.join(root, 'tools', 'site', 'style.css'))
    fs.copyFileSync(path.join(process.cwd(), 'tools', 'site', 'book.js'), path.join(root, 'tools', 'site', 'book.js'))

    const result = buildBook(root)
    assert.equal(result.pages, 3)
    const chapterHtmlPath = path.join(result.destination, 'chapters', 'week-01', 'index.html')
    assert.ok(fs.existsSync(chapterHtmlPath))
    const chapterHtml = fs.readFileSync(chapterHtmlPath, 'utf8')
    assert.match(chapterHtml, /<base href="\.\.\/\.\.\/">/)
    assert.match(chapterHtml, /href="assets\/style\.css"/)
    assert.match(chapterHtml, /id="theme-toggle"/)
    assert.match(chapterHtml, /course-book-theme/)
    assert.match(chapterHtml, /class="search-results"/)
    const searchIndex = JSON.parse(fs.readFileSync(path.join(result.destination, 'search.json'), 'utf8'))
    assert.ok(searchIndex.some((entry) => entry.title === 'Slide 1' && entry.context === 'Week 1 · lecture-a'))
    assert.ok(searchIndex.some((entry) => entry.path === 'chapters/week-01/#lecture-a-slide-001'))
    assert.ok(searchIndex.some((entry) => entry.text.includes('CPU datapath')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
