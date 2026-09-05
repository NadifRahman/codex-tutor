import fs from 'node:fs'
import path from 'node:path'
import { listSources, repoRoot, resolveRepoPath } from './lib/workspace.mjs'

let failures = 0
const nodeMajor = Number(process.versions.node.split('.')[0])
const nodeOkay = nodeMajor >= 18 && nodeMajor < 25
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

function filesIn(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name)
    return entry.isDirectory() ? filesIn(child).map((file) => path.join(entry.name, file)) : [entry.name]
  }).sort()
}

const canonicalSkill = path.join(repoRoot, 'skills', 'course-tutor')
const installedSkillRoot = path.join(repoRoot, '.agents', 'skills', 'course-tutor')
const canonicalFiles = filesIn(canonicalSkill)
const installedFiles = filesIn(installedSkillRoot)
const skillMatches = canonicalFiles.length === installedFiles.length
  && canonicalFiles.every((file, index) => file === installedFiles[index]
    && fs.readFileSync(path.join(canonicalSkill, file)).equals(fs.readFileSync(path.join(installedSkillRoot, file))))
if (canonicalFiles.length && installedFiles.length) {
  console.log(`${skillMatches ? 'ok' : 'warning'} repo skill ${skillMatches ? 'matches canonical copy' : 'differs from canonical copy; run npm run install:skill'}`)
}

try {
  const sources = listSources()
  console.log(`ok ${sources.length} registered source(s)`)
} catch (error) {
  console.log(`error ${error.message}`)
  failures += 1
}

if (failures) process.exitCode = 1
