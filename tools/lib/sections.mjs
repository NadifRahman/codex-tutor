import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { stripFrontmatter } from './workspace.mjs'

// Authored pages are discovered independently of generated weekly chapters.
export function sectionPages(root) {
  const directory = path.join(root, 'notes', 'sections')
  const pages = []
  function visit(folder, parts = []) {
    if (!fs.existsSync(folder)) return
    const entries = fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) =>
      (a.name === 'index.md' ? -1 : b.name === 'index.md' ? 1 : a.name.localeCompare(b.name, undefined, { numeric: true })))
    for (const entry of entries) {
      const source = path.join(folder, entry.name)
      if (entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name)) visit(source, [...parts, entry.name])
      else if (entry.isFile() && /^[a-z0-9][a-z0-9-]*\.md$/.test(entry.name)) {
        const name = entry.name.slice(0, -3)
        const route = [...parts, ...(name === 'index' ? [] : [name])].join('/')
        const title = stripFrontmatter(fs.readFileSync(source, 'utf8')).match(/^#\s+(.+)$/m)?.[1] ?? name
        pages.push({ source, path: `sections/${route ? `${route}/` : ''}`, title, fallback: title })
      }
    }
  }
  visit(directory)
  const routes = new Set()
  for (const page of pages) {
    if (routes.has(page.path)) throw new Error(`Duplicate study section route: ${page.path}`)
    routes.add(page.path)
  }
  return pages
}

export function validateSections(root, sourceIds = []) {
  const errors = []
  let pages
  try { pages = sectionPages(root) } catch (error) { return [error.message] }
  for (const page of pages) {
    const text = fs.readFileSync(page.source, 'utf8')
    if ((text.match(/<!-- personal:start -->/g) ?? []).length !== 1 ||
        (text.match(/<!-- personal:end -->/g) ?? []).length !== 1 ||
        text.indexOf('<!-- personal:start -->') > text.indexOf('<!-- personal:end -->')) errors.push(`${page.source} has invalid personal-note markers`)
  }
  const statePath = path.join(root, 'study-data', 'sections.yml')
  if (!fs.existsSync(statePath)) return errors
  const mapping = value => value && typeof value === 'object' && !Array.isArray(value)
  try {
    const state = YAML.parse(fs.readFileSync(statePath, 'utf8'))
    if (!mapping(state) || state.version !== 1 || !mapping(state.sections)) throw new Error('expected version: 1 and a sections mapping')
    if (state.active_section != null && !Object.hasOwn(state.sections, state.active_section)) errors.push('active_section references an unknown section')
    const sources = new Set(sourceIds)
    for (const [id, section] of Object.entries(state.sections)) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !mapping(section)) { errors.push(`invalid section ${id}`); continue }
      if (!section.title || typeof section.page !== 'string' || !pages.some(page => page.source === path.resolve(root, section.page))) errors.push(`section ${id} must reference an existing section page and have a title`)
      if (!Array.isArray(section.source_ids) || section.source_ids.some(source => !sources.has(source))) errors.push(`section ${id} must reference known source IDs`)
      if (!Array.isArray(section.questions_to_revisit)) errors.push(`section ${id} questions_to_revisit must be an array`)
    }
  } catch (error) { errors.push(`study-data/sections.yml: ${error.message}`) }
  return errors
}
