import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyImportPlan } from './lib/material-import.mjs'
import { parseArgs, repoRoot, resolveRepoPath } from './lib/workspace.mjs'

export function runImport(root = repoRoot, argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const planPath = root === repoRoot
    ? resolveRepoPath(args.plan ?? '.study-cache/material-import-plan.json')
    : path.resolve(root, args.plan ?? '.study-cache/material-import-plan.json')
  if (!planPath.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Import plan must be inside the repository')
  if (!fs.existsSync(planPath)) throw new Error(`Import plan not found: ${path.relative(root, planPath)}`)
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
  const result = applyImportPlan(root, plan)
  for (const item of result.imported) console.log(`imported ${item.inbox} -> ${item.destination} (${item.source_id})`)
  for (const item of result.skipped) console.warn(`skipped ${item.inbox}: duplicate of ${item.source_id} at ${item.path}`)
  console.log(`finished: ${result.imported.length} imported, ${result.skipped.length} skipped`)
  return result
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  runImport()
}
