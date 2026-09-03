import fs from 'node:fs'
import path from 'node:path'
import { openPdf, renderPage } from './lib/pdf.mjs'
import { listSources, pad, parseArgs, resolveRepoPath } from './lib/workspace.mjs'

const args = parseArgs(process.argv.slice(2))
const source = listSources().find((item) => item.id === args.source)
const pageNumber = Number(args.page)
if (!source) throw new Error('Provide a registered source with --source ID')
if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('Provide a positive page with --page N')
if (!source.path || path.extname(source.path).toLowerCase() !== '.pdf') throw new Error('The source must be a local PDF')

const input = resolveRepoPath(source.path)
if (!fs.existsSync(input)) throw new Error(`Source file is missing: ${source.path}`)
const output = resolveRepoPath(`.study-cache/sources/${source.id}/images/page-${pad(pageNumber, 3)}.png`)
const pdf = await openPdf(input)
try {
  if (pageNumber > pdf.numPages) throw new Error(`Page ${pageNumber} exceeds the ${pdf.numPages}-page document`)
  const page = await pdf.getPage(pageNumber)
  await renderPage(page, output)
  page.cleanup()
  console.log(output)
} finally {
  await pdf.destroy()
}

