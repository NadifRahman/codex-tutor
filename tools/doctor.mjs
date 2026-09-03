import fs from 'node:fs'
import path from 'node:path'
import { listSources, repoRoot, resolveRepoPath } from './lib/workspace.mjs'

let failures = 0
const nodeMajor = Number(process.versions.node.split('.')[0])
const nodeOkay = nodeMajor >= 18 && nodeMajor < 23
console.log(`${nodeOkay ? 'ok' : 'error'} node ${process.versions.node}`)
if (!nodeOkay) failures += 1

for (const dependency of ['pdfjs-dist', '@napi-rs/canvas', 'tesseract.js', 'markdown-it', 'katex', 'yaml']) {
  try {
    import.meta.resolve(dependency)
    console.log(`ok dependency ${dependency}`)
  } catch {
    console.log(`error missing dependency ${dependency}; run npm install`)
    failures += 1
  }
}

for (const file of ['course.yml', 'sources.yml', 'study-data/progress.yml', 'skills/course-tutor/SKILL.md']) {
  const exists = fs.existsSync(resolveRepoPath(file))
  console.log(`${exists ? 'ok' : 'error'} ${file}`)
  if (!exists) failures += 1
}

const installedSkill = path.join(repoRoot, '.agents', 'skills', 'course-tutor', 'SKILL.md')
console.log(`${fs.existsSync(installedSkill) ? 'ok' : 'warning'} repo skill ${fs.existsSync(installedSkill) ? 'installed' : 'not installed; AGENTS.md fallback is active'}`)

try {
  const sources = listSources()
  console.log(`ok ${sources.length} registered source(s)`)
} catch (error) {
  console.log(`error ${error.message}`)
  failures += 1
}

if (failures) process.exitCode = 1
