import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot, stripFrontmatter } from './lib/workspace.mjs'

export function assembleChapters(root = repoRoot) {
  const slidesRoot = path.join(root, 'notes', 'slides')
  const chaptersRoot = path.join(root, 'notes', 'chapters')
  fs.mkdirSync(chaptersRoot, { recursive: true })

  const weeks = fs.existsSync(slidesRoot)
    ? fs.readdirSync(slidesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^week-\d+$/.test(entry.name))
    : []
  const outputs = []

  for (const week of weeks) {
  const weekPath = path.join(slidesRoot, week.name)
  const sources = fs.readdirSync(weekPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const sections = []

  for (const source of sources) {
    const sourcePath = path.join(weekPath, source.name)
    const slides = fs.readdirSync(sourcePath)
      .filter((name) => /^slide-\d+\.md$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    if (slides.length === 0) continue
    sections.push(`## ${source.name}\n`)
    for (const slide of slides) {
      const body = stripFrontmatter(fs.readFileSync(path.join(sourcePath, slide), 'utf8'))
      sections.push(body.replace(/^# /m, '### ').trim(), '\n\n---\n')
    }
  }

  if (sections.length === 0) continue
  const weekNumber = Number(week.name.replace('week-', ''))
  const output = `---\ntitle: Week ${weekNumber}\n---\n\n# Week ${weekNumber}\n\n${sections.join('\n')}\n`
    const outputPath = path.join(chaptersRoot, `${week.name}.md`)
    fs.writeFileSync(outputPath, output, 'utf8')
    outputs.push(outputPath)
    console.log(`assembled ${week.name}`)
  }
  return outputs
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  assembleChapters()
}
