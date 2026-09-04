import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import YAML from 'yaml'
import { applyImportPlan, inspectInbox } from '../tools/lib/material-import.mjs'

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-material-import-'))
  fs.mkdirSync(path.join(root, 'materials', 'inbox'), { recursive: true })
  fs.mkdirSync(path.join(root, 'materials', 'local', 'notes'), { recursive: true })
  fs.writeFileSync(path.join(root, 'materials', 'local', 'notes', 'existing.txt'), 'same notes\n')
  fs.writeFileSync(path.join(root, 'sources.yml'), '# keep this comment\nsources:\n  - id: existing-notes\n    type: notes\n    title: Existing notes\n    path: materials/local/notes/existing.txt\n    tracked: false\n')
  return root
}

test('inspects inbox text and identifies a registered duplicate', async () => {
  const root = workspace()
  try {
    fs.writeFileSync(path.join(root, 'materials', 'inbox', 'duplicate.txt'), 'same notes\n')
    const { report, outputPath } = await inspectInbox(root)
    assert.equal(report.files.length, 1)
    assert.equal(report.files[0].duplicate_source.id, 'existing-notes')
    assert.match(report.files[0].preview.text, /same notes/)
    assert.ok(fs.existsSync(outputPath))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('moves resolved imports, registers sources, and leaves duplicates in the inbox', () => {
  const root = workspace()
  try {
    fs.writeFileSync(path.join(root, 'materials', 'inbox', 'lecture.txt'), 'lecture transcript\n')
    fs.writeFileSync(path.join(root, 'materials', 'inbox', 'duplicate.txt'), 'same notes\n')
    const result = applyImportPlan(root, {
      version: 1,
      imports: [
        {
          inbox: 'lecture.txt',
          destination: 'materials/weeks/week-08/transcript-01.txt',
          source: { id: 'week-08-transcript-01', type: 'transcript', title: 'Week 8 Transcript 1', week: 8, tracked: true }
        },
        {
          inbox: 'duplicate.txt',
          destination: 'materials/local/notes/duplicate.txt',
          source: { id: 'duplicate-notes', type: 'notes', title: 'Duplicate notes', tracked: false }
        }
      ]
    })

    assert.equal(result.imported.length, 1)
    assert.equal(result.skipped.length, 1)
    assert.ok(!fs.existsSync(path.join(root, 'materials', 'inbox', 'lecture.txt')))
    assert.ok(fs.existsSync(path.join(root, 'materials', 'weeks', 'week-08', 'transcript-01.txt')))
    assert.ok(fs.existsSync(path.join(root, 'materials', 'inbox', 'duplicate.txt')))
    const yamlText = fs.readFileSync(path.join(root, 'sources.yml'), 'utf8')
    const sources = YAML.parse(yamlText).sources
    assert.match(yamlText, /keep this comment/)
    assert.equal(sources.length, 2)
    assert.equal(sources[1].id, 'week-08-transcript-01')
    assert.equal(sources[1].path, 'materials/weeks/week-08/transcript-01.txt')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('rejects unsafe or conflicting plans before moving files', () => {
  const root = workspace()
  try {
    const inboxPath = path.join(root, 'materials', 'inbox', 'lecture.txt')
    fs.writeFileSync(inboxPath, 'lecture\n')
    const originalYaml = fs.readFileSync(path.join(root, 'sources.yml'), 'utf8')
    assert.throws(() => applyImportPlan(root, {
      version: 1,
      imports: [{
        inbox: 'lecture.txt',
        destination: '../outside.txt',
        source: { id: 'unsafe', type: 'lecture', title: 'Unsafe', week: 8, tracked: true }
      }]
    }), /Destination must be inside/)
    assert.ok(fs.existsSync(inboxPath))
    assert.equal(fs.readFileSync(path.join(root, 'sources.yml'), 'utf8'), originalYaml)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
