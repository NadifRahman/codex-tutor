import fs from 'node:fs'
import path from 'node:path'
import { listSources, readYaml, resolveRepoPath } from './lib/workspace.mjs'

const errors = []
const warnings = []
const allowedTypes = new Set(['lecture', 'transcript', 'textbook', 'assessment', 'assignment', 'lab', 'homework', 'outline', 'notes', 'web'])
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

for (const warning of warnings) console.warn(`warning: ${warning}`)
for (const error of errors) console.error(`error: ${error}`)
if (errors.length) process.exitCode = 1
else console.log(`valid workspace (${sources.length} sources, ${warnings.length} warnings)`)

