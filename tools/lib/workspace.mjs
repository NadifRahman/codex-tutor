import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export function readYaml(relativePath) {
  const absolutePath = resolveRepoPath(relativePath)
  return YAML.parse(fs.readFileSync(absolutePath, 'utf8'))
}

export function writeYaml(relativePath, value) {
  const absolutePath = resolveRepoPath(relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, YAML.stringify(value), 'utf8')
}

export function resolveRepoPath(relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath)
  if (absolutePath !== repoRoot && !absolutePath.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Path escapes the repository: ${relativePath}`)
  }
  return absolutePath
}

export function normalizeRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/')
}

export function hashFile(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

export function pad(value, width = 2) {
  return String(value).padStart(width, '0')
}

export function assertSourceId(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`Invalid source id "${id}"; use lowercase letters, digits, and hyphens`)
  }
}

export function parseArgs(argv) {
  const result = { _: [] }
  const booleanFlags = new Set(['all', 'force', 'no-ocr'])
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      result._.push(token)
      continue
    }
    const key = token.slice(2)
    if (booleanFlags.has(key)) {
      result[key] = true
      continue
    }
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      result[key] = next
      index += 1
    } else {
      result[key] = true
    }
  }
  return result
}

export function listSources() {
  const manifest = readYaml('sources.yml')
  if (!manifest || !Array.isArray(manifest.sources)) {
    throw new Error('sources.yml must contain a sources array')
  }
  const seen = new Set()
  for (const source of manifest.sources) {
    assertSourceId(source.id)
    if (seen.has(source.id)) throw new Error(`Duplicate source id: ${source.id}`)
    seen.add(source.id)
  }
  return manifest.sources
}

export function stripFrontmatter(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
}
