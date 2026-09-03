import fs from 'node:fs'
import path from 'node:path'
import { createWorker } from 'tesseract.js'
import { extractPage, openPdf, renderPage } from './lib/pdf.mjs'
import {
  hashFile,
  listSources,
  normalizeRelative,
  pad,
  parseArgs,
  readYaml,
  repoRoot,
  resolveRepoPath
} from './lib/workspace.mjs'

const args = parseArgs(process.argv.slice(2))
const selectedWeek = args.week === undefined ? null : Number(args.week)
const selectedSource = args.source ?? null
const force = Boolean(args.force)
const ocrEnabled = !args['no-ocr']

if (selectedWeek !== null && (!Number.isInteger(selectedWeek) || selectedWeek < 1)) {
  throw new Error('--week must be a positive integer')
}

const allSources = listSources()
const selected = allSources.filter((source) => {
  if (selectedSource) return source.id === selectedSource
  if (selectedWeek !== null) {
    const courseWideTypes = new Set(['outline', 'textbook', 'assessment', 'notes', 'web'])
    return Number(source.week) === selectedWeek || (source.week === undefined && courseWideTypes.has(source.type))
  }
  return Boolean(args.all)
})

if (!selectedSource && selectedWeek === null && !args.all) {
  throw new Error('Choose --week N, --source ID, or --all')
}
if (selected.length === 0) throw new Error('No sources matched the selection')

let ocrWorker
async function recognize(imagePath) {
  ocrWorker ??= await createWorker('eng')
  const result = await ocrWorker.recognize(imagePath)
  return result.data.text.trim()
}

function lineNumberText(text) {
  return text.split(/\r?\n/).map((line, index) => `${index + 1}: ${line}`).join('\n')
}

function sourcePath(source) {
  if (!source.path) return null
  return resolveRepoPath(source.path)
}

function existingCacheIsComplete(source, hash) {
  const manifestPath = resolveRepoPath(`.study-cache/sources/${source.id}/manifest.json`)
  if (!fs.existsSync(manifestPath)) return false
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.sha256 !== hash || !manifest.page_count) return false
  return Array.from({ length: manifest.page_count }, (_, index) => index + 1).every((page) => {
    const textExists = fs.existsSync(resolveRepoPath(`.study-cache/sources/${source.id}/text/page-${pad(page, 3)}.txt`))
    const imageRequired = source.type === 'lecture'
    const imageExists = fs.existsSync(resolveRepoPath(`notes/public/generated/${source.id}/slide-${pad(page, 3)}.png`))
    return textExists && (!imageRequired || imageExists)
  })
}

function createSlideNote(source, pageNumber) {
  const week = pad(source.week)
  const page = pad(pageNumber, 3)
  const slideId = `${source.id}-slide-${page}`
  const notePath = resolveRepoPath(`notes/slides/week-${week}/${source.id}/slide-${page}.md`)
  if (fs.existsSync(notePath)) return false
  fs.mkdirSync(path.dirname(notePath), { recursive: true })
  const markdown = `---
slide_id: ${JSON.stringify(slideId)}
source_id: ${JSON.stringify(source.id)}
page: ${pageNumber}
week: ${Number(source.week)}
status: unseen
concepts: []
---

# Slide ${pageNumber}

![Original slide ${pageNumber}](/generated/${source.id}/slide-${page}.png)

## Explanation

_The course tutor will develop this explanation with you._

## Walkthrough

_Diagrams, equations, code, and examples will be explained here._

## Connections and exam relevance

_Connections will be added when supported by course sources._

## Check your understanding

_A concept-level check will be added when appropriate._

<!-- personal:start -->
## Personal notes

<!-- personal:end -->

## Sources

- [${source.id}, p. ${pageNumber}]
`
  fs.writeFileSync(notePath, markdown, 'utf8')
  return true
}

async function preparePdf(source, filePath) {
  const hash = hashFile(filePath)
  if (!force && existingCacheIsComplete(source, hash)) {
    console.log(`unchanged ${source.id}`)
    return
  }

  const pdf = await openPdf(filePath)
  const cacheDir = resolveRepoPath(`.study-cache/sources/${source.id}`)
  fs.mkdirSync(path.join(cacheDir, 'text'), { recursive: true })
  fs.mkdirSync(path.join(cacheDir, 'structured'), { recursive: true })
  let createdNotes = 0

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const extracted = await extractPage(page)
      const pageName = `page-${pad(pageNumber, 3)}`
      let imagePath

      if (source.type === 'lecture') {
        imagePath = resolveRepoPath(`notes/public/generated/${source.id}/slide-${pad(pageNumber, 3)}.png`)
        await renderPage(page, imagePath)
        if (createSlideNote(source, pageNumber)) createdNotes += 1
      } else if (source.type === 'assessment') {
        imagePath = path.join(cacheDir, 'images', `${pageName}.png`)
        await renderPage(page, imagePath)
      }

      let text = extracted.text
      let usedOcr = false
      if (ocrEnabled && text.replace(/\s/g, '').length < 24) {
        imagePath ??= path.join(cacheDir, 'images', `${pageName}.png`)
        if (!fs.existsSync(imagePath)) await renderPage(page, imagePath)
        text = await recognize(imagePath)
        usedOcr = true
      }

      fs.writeFileSync(path.join(cacheDir, 'text', `${pageName}.txt`), text, 'utf8')
      fs.writeFileSync(
        path.join(cacheDir, 'structured', `${pageName}.json`),
        `${JSON.stringify({ page: pageNumber, used_ocr: usedOcr, items: extracted.items }, null, 2)}\n`,
        'utf8'
      )
      page.cleanup()
    }

    const manifest = {
      source_id: source.id,
      source_type: source.type,
      input: normalizeRelative(filePath),
      sha256: hash,
      page_count: pdf.numPages,
      prepared_at: new Date().toISOString()
    }
    fs.writeFileSync(path.join(cacheDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    console.log(`prepared ${source.id}: ${pdf.numPages} pages, ${createdNotes} new slide notes`)
  } finally {
    await pdf.destroy()
  }
}

async function prepareText(source, filePath) {
  const cacheDir = resolveRepoPath(`.study-cache/sources/${source.id}`)
  fs.mkdirSync(cacheDir, { recursive: true })
  const text = fs.readFileSync(filePath, 'utf8')
  fs.writeFileSync(path.join(cacheDir, 'transcript.txt'), lineNumberText(text), 'utf8')
  fs.writeFileSync(path.join(cacheDir, 'manifest.json'), `${JSON.stringify({
    source_id: source.id,
    source_type: source.type,
    input: normalizeRelative(filePath),
    sha256: hashFile(filePath),
    lines: text.split(/\r?\n/).length,
    prepared_at: new Date().toISOString()
  }, null, 2)}\n`, 'utf8')
  console.log(`prepared ${source.id}: line-numbered text`)
}

try {
  for (const source of selected) {
    if (source.type === 'web') {
      console.log(`registered web source ${source.id}: fetch on demand`)
      continue
    }
    const filePath = sourcePath(source)
    if (!filePath || !fs.existsSync(filePath)) {
      const message = `missing ${source.tracked === false ? 'local' : 'tracked'} source ${source.id}: ${source.path}`
      if (source.tracked === false) {
        console.warn(`warning: ${message}`)
        continue
      }
      throw new Error(message)
    }
    if (path.extname(filePath).toLowerCase() === '.pdf') await preparePdf(source, filePath)
    else if (['.md', '.txt'].includes(path.extname(filePath).toLowerCase())) await prepareText(source, filePath)
    else console.warn(`warning: registered but not preprocessed: ${source.id} (${path.extname(filePath)})`)
  }
} finally {
  if (ocrWorker) await ocrWorker.terminate()
}
