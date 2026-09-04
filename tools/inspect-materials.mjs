import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectInbox } from './lib/material-import.mjs'
import { repoRoot } from './lib/workspace.mjs'

export async function runInspection(root = repoRoot) {
  const { report, outputPath } = await inspectInbox(root)
  for (const file of report.files) {
    const duplicate = file.duplicate_source ? `, duplicate of ${file.duplicate_source.id}` : ''
    console.log(`${file.inbox}: ${file.extension || 'unknown'}, ${file.bytes} bytes${duplicate}`)
    for (const warning of file.warnings) console.warn(`warning: ${file.inbox}: ${warning}`)
  }
  console.log(`inspected ${report.files.length} inbox file(s); report: ${path.relative(root, outputPath)}`)
  return report
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  await runInspection()
}
