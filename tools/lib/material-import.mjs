import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const allowedTypes = new Set(['lecture', 'transcript', 'textbook', 'assessment', 'assignment', 'lab', 'homework', 'outline', 'notes'])
const allowedDestinations = ['materials/weeks', 'materials/course', 'materials/local']
const textExtensions = new Set(['.md', '.txt'])

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function resolveWithin(root, relativePath, parent) {
  const absolute = path.resolve(root, relativePath)
  const boundary = path.resolve(root, parent)
  if (absolute === boundary || !absolute.startsWith(`${boundary}${path.sep}`)) {
    throw new Error(`Path must stay inside ${normalize(parent)}: ${relativePath}`)
  }
  return absolute
}

function fileHash(filePath) {
  const hash = crypto.createHash('sha256')
  const handle = fs.openSync(filePath, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytesRead
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null)
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead)
  } finally {
    fs.closeSync(handle)
  }
  return hash.digest('hex')
}

function readYamlDocument(root) {
  const sourcePath = path.join(root, 'sources.yml')
  const sourceText = fs.readFileSync(sourcePath, 'utf8')
  const document = YAML.parseDocument(sourceText)
  if (document.errors.length) throw new Error(`Could not parse sources.yml: ${document.errors[0].message}`)
  const sources = document.get('sources', true)
  if (!YAML.isSeq(sources)) throw new Error('sources.yml must contain a sources array')
  return { document, sourcePath, sourceText, sources, values: sources.toJSON() }
}

function registeredFiles(root, sources) {
  return sources.flatMap((source) => {
    if (!source?.path) return []
    const filePath = path.resolve(root, source.path)
    if (!filePath.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(filePath)) return []
    const stat = fs.lstatSync(filePath)
    return stat.isFile() ? [{ id: source.id, path: normalize(source.path), filePath, size: stat.size }] : []
  })
}

function findDuplicate(filePath, size, registered, hashCache, knownHash = null) {
  const candidates = registered.filter((entry) => entry.size === size)
  if (candidates.length === 0) return null
  const incomingHash = knownHash ?? fileHash(filePath)
  for (const candidate of candidates) {
    let candidateHash = hashCache.get(candidate.filePath)
    if (!candidateHash) {
      candidateHash = fileHash(candidate.filePath)
      hashCache.set(candidate.filePath, candidateHash)
    }
    if (candidateHash === incomingHash) return { ...candidate, sha256: incomingHash }
  }
  return null
}

function readTextPreview(filePath, maxBytes = 12000) {
  const handle = fs.openSync(filePath, 'r')
  const buffer = Buffer.alloc(maxBytes)
  try {
    const bytesRead = fs.readSync(handle, buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).toString('utf8').replace(/\0/g, '').trim()
  } finally {
    fs.closeSync(handle)
  }
}

async function pdfPreview(filePath) {
  const { extractPage, openPdf } = await import('./pdf.mjs')
  const pdf = await openPdf(filePath)
  const samples = []
  try {
    const pageNumbers = [...new Set([1, 2, 3, pdf.numPages].filter((page) => page <= pdf.numPages))]
    for (const pageNumber of pageNumbers) {
      const page = await pdf.getPage(pageNumber)
      const extracted = await extractPage(page)
      samples.push({ page: pageNumber, text: extracted.text.slice(0, 5000) })
      page.cleanup()
    }
    return { page_count: pdf.numPages, samples }
  } finally {
    await pdf.destroy()
  }
}

function inboxFiles(inboxRoot) {
  if (!fs.existsSync(inboxRoot)) return []
  const output = []
  const stack = [inboxRoot]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(fullPath)
      else if (entry.isFile() && entry.name !== '.gitkeep') output.push(fullPath)
    }
  }
  return output.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export async function inspectInbox(root) {
  const inboxRoot = path.join(root, 'materials', 'inbox')
  fs.mkdirSync(inboxRoot, { recursive: true })
  const { values } = readYamlDocument(root)
  const registered = registeredFiles(root, values)
  const hashCache = new Map()
  const files = []

  for (const filePath of inboxFiles(inboxRoot)) {
    const stat = fs.statSync(filePath)
    const extension = path.extname(filePath).toLowerCase()
    const item = {
      inbox: normalize(path.relative(inboxRoot, filePath)),
      filename: path.basename(filePath),
      extension,
      bytes: stat.size,
      sha256: fileHash(filePath),
      duplicate_source: null,
      preview: null,
      warnings: []
    }
    const duplicate = findDuplicate(filePath, stat.size, registered, hashCache, item.sha256)
    if (duplicate) item.duplicate_source = { id: duplicate.id, path: duplicate.path }
    if (textExtensions.has(extension)) item.preview = { text: readTextPreview(filePath) }
    else if (extension === '.pdf') {
      try {
        item.preview = await pdfPreview(filePath)
      } catch (error) {
        item.warnings.push(`Could not inspect PDF content: ${error.message}`)
      }
    } else {
      item.warnings.push(`Content inspection is not available for ${extension || 'this file type'}`)
    }
    files.push(item)
  }

  const report = { version: 1, generated_at: new Date().toISOString(), files }
  const outputPath = path.join(root, '.study-cache', 'material-inbox.json')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return { report, outputPath }
}

function validatedDestination(root, relativePath) {
  const normalized = normalize(relativePath)
  const parent = allowedDestinations.find((candidate) => normalized.startsWith(`${candidate}/`))
  if (!parent) throw new Error(`Destination must be inside ${allowedDestinations.join(', ')}: ${relativePath}`)
  return { absolute: resolveWithin(root, normalized, parent), normalized }
}

function validateSource(source, destination) {
  if (!source || typeof source !== 'object') throw new Error('Each import needs a source object')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(source.id ?? '')) throw new Error(`Invalid source id: ${source.id ?? '(missing)'}`)
  if (!allowedTypes.has(source.type)) throw new Error(`Unsupported source type for ${source.id}: ${source.type}`)
  if (!source.title || typeof source.title !== 'string') throw new Error(`${source.id} is missing a title`)
  if (typeof source.tracked !== 'boolean') throw new Error(`${source.id} must set tracked to true or false`)
  if (source.week !== undefined && (!Number.isInteger(Number(source.week)) || Number(source.week) < 1)) throw new Error(`${source.id} has an invalid week`)
  if (source.lecture !== undefined && (!Number.isInteger(Number(source.lecture)) || Number(source.lecture) < 1)) throw new Error(`${source.id} has an invalid lecture`)
  const isLocal = destination.startsWith('materials/local/')
  if (isLocal && source.tracked !== false) throw new Error(`${source.id} is under materials/local and must set tracked: false`)
  if (!isLocal && source.tracked === false) throw new Error(`${source.id} sets tracked: false but is not under materials/local`)
}

function sourceRecord(source, destination) {
  const record = { id: source.id, type: source.type, title: source.title, path: destination }
  if (source.week !== undefined) record.week = Number(source.week)
  if (source.lecture !== undefined) record.lecture = Number(source.lecture)
  record.tracked = source.tracked
  return record
}

export function applyImportPlan(root, plan) {
  if (!plan || plan.version !== 1 || !Array.isArray(plan.imports)) throw new Error('Import plan must have version 1 and an imports array')
  const yaml = readYamlDocument(root)
  const registered = registeredFiles(root, yaml.values)
  const existingIds = new Set(yaml.values.map((source) => source.id))
  const existingPaths = new Set(yaml.values.filter((source) => source.path).map((source) => normalize(source.path).toLowerCase()))
  const plannedIds = new Set()
  const plannedPaths = new Set()
  const acceptedHashes = new Map()
  const hashCache = new Map()
  const accepted = []
  const skipped = []
  const errors = []

  for (const [index, item] of plan.imports.entries()) {
    try {
      if (!item?.inbox || typeof item.inbox !== 'string') throw new Error('Import is missing its inbox path')
      const sourcePath = resolveWithin(root, path.join('materials', 'inbox', item.inbox), path.join('materials', 'inbox'))
      if (!fs.existsSync(sourcePath) || !fs.lstatSync(sourcePath).isFile()) throw new Error(`Inbox file does not exist: ${item.inbox}`)
      const destination = validatedDestination(root, item.destination)
      validateSource(item.source, destination.normalized)
      if (path.extname(sourcePath).toLowerCase() !== path.extname(destination.absolute).toLowerCase()) throw new Error(`File extension cannot change for ${item.inbox}`)

      const stat = fs.statSync(sourcePath)
      const duplicate = findDuplicate(sourcePath, stat.size, registered, hashCache)
      const incomingHash = duplicate?.sha256 ?? fileHash(sourcePath)
      const batchDuplicate = acceptedHashes.get(incomingHash)
      if (duplicate || batchDuplicate) {
        skipped.push({ inbox: item.inbox, reason: 'duplicate', source_id: duplicate?.id ?? batchDuplicate.source.id, path: duplicate?.path ?? batchDuplicate.destination.normalized })
        continue
      }
      if (existingIds.has(item.source.id) || plannedIds.has(item.source.id)) throw new Error(`Source id already exists: ${item.source.id}`)
      if (existingPaths.has(destination.normalized.toLowerCase()) || plannedPaths.has(destination.normalized.toLowerCase())) throw new Error(`Source path already exists in sources.yml: ${destination.normalized}`)
      if (fs.existsSync(destination.absolute)) throw new Error(`Destination already exists: ${destination.normalized}`)

      const prepared = { item, sourcePath, destination, source: sourceRecord(item.source, destination.normalized), incomingHash }
      accepted.push(prepared)
      plannedIds.add(item.source.id)
      plannedPaths.add(destination.normalized.toLowerCase())
      acceptedHashes.set(incomingHash, prepared)
    } catch (error) {
      errors.push(`imports[${index}]: ${error.message}`)
    }
  }

  if (errors.length) throw new Error(`Import plan failed validation:\n- ${errors.join('\n- ')}`)
  if (accepted.length === 0) return { imported: [], skipped }

  for (const entry of accepted) yaml.sources.add(entry.source)
  const nextYaml = String(yaml.document)
  const check = YAML.parse(nextYaml)
  if (!Array.isArray(check?.sources)) throw new Error('Generated sources.yml is invalid')

  const moved = []
  try {
    for (const entry of accepted) {
      fs.mkdirSync(path.dirname(entry.destination.absolute), { recursive: true })
      fs.renameSync(entry.sourcePath, entry.destination.absolute)
      moved.push(entry)
    }
    fs.writeFileSync(yaml.sourcePath, nextYaml, 'utf8')
  } catch (error) {
    try { fs.writeFileSync(yaml.sourcePath, yaml.sourceText, 'utf8') } catch {}
    for (const entry of moved.reverse()) {
      try {
        fs.mkdirSync(path.dirname(entry.sourcePath), { recursive: true })
        if (fs.existsSync(entry.destination.absolute) && !fs.existsSync(entry.sourcePath)) fs.renameSync(entry.destination.absolute, entry.sourcePath)
      } catch {}
    }
    throw new Error(`Import was rolled back: ${error.message}`)
  }

  return {
    imported: accepted.map((entry) => ({ inbox: entry.item.inbox, destination: entry.destination.normalized, source_id: entry.source.id })),
    skipped
  }
}
