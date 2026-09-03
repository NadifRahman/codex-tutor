import assert from 'node:assert/strict'
import test from 'node:test'
import { pad, parseArgs, resolveRepoPath, stripFrontmatter } from '../tools/lib/workspace.mjs'

test('parseArgs parses flags, values, and positional input', () => {
  assert.deepEqual(parseArgs(['--week', '3', '--force', 'extra']), { week: '3', force: true, _: ['extra'] })
})

test('path resolution blocks traversal outside the repository', () => {
  assert.throws(() => resolveRepoPath('../outside.txt'), /escapes the repository/)
})

test('padding and frontmatter removal are deterministic', () => {
  assert.equal(pad(7, 3), '007')
  assert.equal(stripFrontmatter('---\ntitle: Test\n---\n\n# Body\n'), '\n# Body\n')
})

