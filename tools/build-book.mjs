import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { repoRoot, stripFrontmatter } from './lib/workspace.mjs'

const outputRoot = path.join(repoRoot, '.study-cache', 'book')
const markdown = new MarkdownIt({ html: true, linkify: true, typographer: true })

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(source, destination, { recursive: true })
}

function titleFrom(markdownText, fallback) {
  const heading = stripFrontmatter(markdownText).match(/^#\s+(.+)$/m)
  return heading?.[1] ?? fallback
}

function plainText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function pageTemplate({ title, body, currentPath, chapterLinks }) {
  const safeTitle = escapeHtml(title)
  const depth = currentPath.split('/').filter(Boolean).length
  const rootPrefix = depth === 0 ? './' : '../'.repeat(depth)
  const nav = chapterLinks.map((chapter) => `<a href="${chapter.path}"${currentPath === chapter.path ? ' aria-current="page"' : ''}>${escapeHtml(chapter.title)}</a>`).join('\n')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${rootPrefix}">
  <title>${safeTitle} · Course Study Book</title>
  <link rel="stylesheet" href="assets/style.css">
  <link rel="stylesheet" href="assets/katex/katex.min.css">
</head>
<body>
  <header><a class="brand" href="./">Course Study Book</a><input id="search" type="search" placeholder="Search notes…" autocomplete="off"></header>
  <div class="layout">
    <aside><a href="guide/">Using this book</a><h2>Weekly chapters</h2>${nav}<div id="results"></div></aside>
    <main>${body}</main>
  </div>
  <script defer src="assets/katex/katex.min.js"></script>
  <script defer src="assets/katex/contrib/auto-render.min.js"></script>
  <script defer src="assets/book.js"></script>
</body>
</html>\n`
}

export function buildBook(root = repoRoot) {
  const destination = path.join(root, '.study-cache', 'book')
  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(path.join(destination, 'assets'), { recursive: true })

  const chapterDir = path.join(root, 'notes', 'chapters')
  const chapterFiles = fs.existsSync(chapterDir)
    ? fs.readdirSync(chapterDir).filter((name) => /^week-\d+\.md$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : []
  const chapterLinks = chapterFiles.map((name) => ({
    title: `Week ${Number(name.match(/\d+/)[0])}`,
    path: `chapters/${name.replace('.md', '')}/`
  }))

  const pages = [
    { source: path.join(root, 'notes', 'index.md'), path: '', fallback: 'Course Study Book' },
    { source: path.join(root, 'notes', 'guide.md'), path: 'guide/', fallback: 'Using this book' },
    ...chapterFiles.map((name) => ({ source: path.join(chapterDir, name), path: `chapters/${name.replace('.md', '')}/`, fallback: name }))
  ]
  const searchIndex = []

  for (const page of pages) {
    const sourceText = fs.readFileSync(page.source, 'utf8')
    const title = titleFrom(sourceText, page.fallback)
    const body = markdown.render(stripFrontmatter(sourceText))
    const outputDir = path.join(destination, page.path)
    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'index.html'), pageTemplate({ title, body, currentPath: page.path, chapterLinks }), 'utf8')
    searchIndex.push({ title, path: page.path || './', text: plainText(body).slice(0, 30000) })
  }

  copyDirectory(path.join(root, 'notes', 'public', 'generated'), path.join(destination, 'generated'))
  copyDirectory(path.join(root, 'node_modules', 'katex', 'dist', 'fonts'), path.join(destination, 'assets', 'katex', 'fonts'))
  for (const relative of ['katex.min.css', 'katex.min.js', 'contrib/auto-render.min.js']) {
    const source = path.join(root, 'node_modules', 'katex', 'dist', relative)
    const target = path.join(destination, 'assets', 'katex', relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
  }
  fs.copyFileSync(path.join(root, 'tools', 'site', 'style.css'), path.join(destination, 'assets', 'style.css'))
  fs.copyFileSync(path.join(root, 'tools', 'site', 'book.js'), path.join(destination, 'assets', 'book.js'))
  fs.writeFileSync(path.join(destination, 'search.json'), `${JSON.stringify(searchIndex)}\n`, 'utf8')
  console.log(`built ${pages.length} pages in ${destination}`)
  return { destination, pages: pages.length }
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) buildBook()
