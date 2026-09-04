import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import YAML from 'yaml'
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

function readYamlOr(root, relativePath, fallback) {
  const filePath = path.join(root, relativePath)
  if (!fs.existsSync(filePath)) return fallback
  try {
    return YAML.parse(fs.readFileSync(filePath, 'utf8')) ?? fallback
  } catch {
    return fallback
  }
}

function slideSearchEntries(markdownText, pageTitle, pagePath) {
  const entries = []
  const pattern = /<!-- search:start ([a-zA-Z0-9_-]+) -->([\s\S]*?)<!-- search:end -->/g
  for (const match of markdownText.matchAll(pattern)) {
    const id = match[1]
    const section = match[2]
    const slideTitle = section.match(/^###\s+(.+)$/m)?.[1] ?? 'Slide'
    const source = id.replace(/-slide-\d+$/, '')
    entries.push({
      title: slideTitle,
      context: `${pageTitle} · ${source}`,
      path: `${pagePath}#${id}`,
      text: plainText(markdown.render(section)).slice(0, 12000)
    })
  }
  return entries
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function slideLabel(slideId) {
  const number = slideId?.match(/-slide-(\d+)$/)?.[1]
  return number ? `Slide ${Number(number)}` : 'current slide'
}

function slideLink(slideId, fallbackWeek) {
  if (!slideId) return null
  const week = Number(slideId.match(/^week-(\d+)/)?.[1] ?? fallbackWeek)
  if (!Number.isInteger(week) || week < 1) return null
  return `chapters/week-${String(week).padStart(2, '0')}/#${encodeURIComponent(slideId)}`
}

function conceptLabel(id) {
  const acronyms = new Set(['alu', 'cpu', 'fsm', 'io', 'isa', 'pc'])
  return id.split('-').map((word) => acronyms.has(word) ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`).join(' ')
}

function dashboardHtml({ root, chapterFiles }) {
  const course = readYamlOr(root, 'course.yml', {}).course ?? {}
  const progress = readYamlOr(root, path.join('study-data', 'progress.yml'), {})
  const sources = readYamlOr(root, 'sources.yml', {}).sources ?? []
  const slides = progress.slides ?? {}
  const checkpoint = progress.checkpoint ?? {}
  const weeks = chapterFiles.map((name) => {
    const week = Number(name.match(/\d+/)?.[0])
    const markdownText = fs.readFileSync(path.join(root, 'notes', 'chapters', name), 'utf8')
    const entries = slideSearchEntries(stripFrontmatter(markdownText), `Week ${week}`, `chapters/${name.replace('.md', '')}/`)
    const counts = { unseen: 0, teaching: 0, understood: 0, 'review-needed': 0 }
    for (const entry of entries) {
      const slideId = entry.path.split('#')[1]
      const status = slides[slideId]?.status ?? 'unseen'
      counts[status] = (counts[status] ?? 0) + 1
    }
    const placeholders = (markdownText.match(/_The course tutor will develop this explanation with you\._/g) ?? []).length
    return { week, entries, counts, placeholders, total: entries.length, path: `chapters/${name.replace('.md', '')}/` }
  })

  const checkpointWeek = Number(checkpoint.week)
  const configuredWeek = Number(course.current_week)
  const activeWeek = Number.isInteger(checkpointWeek) && checkpoint.slide_id
    ? checkpointWeek
    : Number.isInteger(configuredWeek) ? configuredWeek : weeks[0]?.week
  const activeChapter = weeks.find((week) => week.week === activeWeek)
  const checkpointLink = slideLink(checkpoint.slide_id, activeWeek)
  const resumeHref = checkpointLink && activeChapter ? checkpointLink : activeChapter?.path ?? 'guide/'
  const resumeTitle = checkpointLink && activeChapter ? `Resume at ${slideLabel(checkpoint.slide_id)}` : activeChapter ? `Open Week ${activeWeek}` : 'Set up the course'
  const resumeDetail = checkpointLink && activeChapter
    ? `Week ${activeWeek} · ${escapeHtml(checkpoint.source_id ?? 'lecture')}`
    : activeChapter ? `${activeChapter.total} prepared slides` : 'Prepare a week to begin building your dashboard.'

  const totals = weeks.reduce((sum, week) => {
    sum.slides += week.total
    sum.understood += week.counts.understood
    sum.review += week.counts['review-needed']
    return sum
  }, { slides: 0, understood: 0, review: 0 })
  const progressPercent = totals.slides ? Math.round((totals.understood / totals.slides) * 100) : 0

  const weekRows = weeks.length > 0 ? weeks.map((week) => {
    const understoodPercent = week.total ? (week.counts.understood / week.total) * 100 : 0
    const reviewPercent = week.total ? (week.counts['review-needed'] / week.total) * 100 : 0
    const details = [
      `${week.counts.understood} understood`,
      week.counts.teaching ? `${week.counts.teaching} in progress` : null,
      week.counts['review-needed'] ? `${week.counts['review-needed']} to review` : null
    ].filter(Boolean).join(' · ')
    return `<a class="week-progress" href="${week.path}">
      <span class="week-progress-heading"><strong>Week ${week.week}</strong><span>${week.counts.understood}/${week.total}</span></span>
      <span class="progress-track" role="img" aria-label="${escapeHtml(details)}"><span class="progress-understood" style="width:${understoodPercent}%"></span><span class="progress-review" style="width:${reviewPercent}%"></span></span>
      <span class="week-progress-detail">${escapeHtml(details)}</span>
    </a>`
  }).join('\n') : '<p class="dashboard-empty">Prepared weeks will appear here.</p>'

  const concepts = Object.entries(progress.concepts ?? {}).map(([id, value]) => {
    const relatedSlides = Array.isArray(value.related_slides) ? value.related_slides : []
    const reviewSlide = relatedSlides.find((slideId) => slides[slideId]?.status === 'review-needed')
    const priority = value.review_priority ?? 'normal'
    const confidence = Number.isFinite(Number(value.confidence)) ? Number(value.confidence) : 0
    const needsReview = Boolean(reviewSlide) || ['high', 'urgent'].includes(priority) || confidence <= 1
    return { id, ...value, confidence, needsReview, link: slideLink(reviewSlide ?? relatedSlides[0], activeWeek) }
  }).filter((concept) => concept.needsReview)
  const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 }
  concepts.sort((a, b) => (priorityRank[a.review_priority] ?? 2) - (priorityRank[b.review_priority] ?? 2) || a.confidence - b.confidence || a.id.localeCompare(b.id))
  const reviewRows = concepts.length > 0 ? `<ul class="review-list">${concepts.slice(0, 5).map((concept) => {
    const content = `<span><strong>${escapeHtml(conceptLabel(concept.id))}</strong><small>Confidence ${concept.confidence}/3 · ${escapeHtml(concept.review_priority ?? 'normal')} priority</small></span><span aria-hidden="true">→</span>`
    return `<li>${concept.link ? `<a href="${concept.link}">${content}</a>` : `<span>${content}</span>`}</li>`
  }).join('')}</ul>${concepts.length > 5 ? `<p class="dashboard-more">+${concepts.length - 5} more concepts</p>` : ''}` : '<p class="dashboard-empty">No review concepts yet. They will appear as you study.</p>'

  const activeSources = sources.filter((source) => Number(source.week) === activeWeek)
  const sourceCount = (type) => activeSources.filter((source) => source.type === type).length
  const preparedCount = activeSources.filter((source) => fs.existsSync(path.join(root, '.study-cache', 'sources', source.id, 'manifest.json'))).length
  const materialWarnings = []
  if (activeSources.length === 0) materialWarnings.push('No sources are registered for this week.')
  if (sourceCount('lecture') > 0 && sourceCount('transcript') === 0) materialWarnings.push('No transcript is registered for this week.')
  if (activeSources.length > preparedCount) materialWarnings.push(`${activeSources.length - preparedCount} registered source${activeSources.length - preparedCount === 1 ? '' : 's'} not prepared yet.`)
  if (activeChapter?.placeholders) materialWarnings.push(`${activeChapter.placeholders} slide explanation${activeChapter.placeholders === 1 ? '' : 's'} still contain placeholders.`)
  const materialRows = `<dl class="material-stats">
    <div><dt>Lectures</dt><dd>${sourceCount('lecture')}</dd></div>
    <div><dt>Slides</dt><dd>${activeChapter?.total ?? 0}</dd></div>
    <div><dt>Transcripts</dt><dd>${sourceCount('transcript')}</dd></div>
    <div><dt>Supporting notes</dt><dd>${sourceCount('notes')}</dd></div>
  </dl>`
  const warnings = materialWarnings.length > 0
    ? `<ul class="material-warnings">${materialWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
    : '<p class="material-ready">All registered material for this week is prepared.</p>'

  const configuredTitle = course.title && !String(course.title).startsWith('Replace with') ? course.title : null
  const configuredCode = course.code && course.code !== 'COURSE-000' ? course.code : null
  const courseName = configuredTitle ?? configuredCode ?? 'Course Study Book'

  return `<section class="dashboard" aria-labelledby="dashboard-title">
    <div class="dashboard-hero">
      <div><span class="dashboard-eyebrow">${escapeHtml(courseName)}</span><h1 id="dashboard-title">Welcome back</h1><p>${totals.slides ? `${totals.understood} of ${totals.slides} slides understood · ${progressPercent}% complete` : 'Your study progress will collect here.'}</p></div>
      <a class="dashboard-primary" href="${resumeHref}"><span>${escapeHtml(resumeTitle)}</span><small>${resumeDetail}</small></a>
    </div>
    <div class="dashboard-grid">
      <section class="dashboard-card"><div class="dashboard-card-heading"><div><span class="dashboard-kicker">Progress</span><h2>Weekly chapters</h2></div><strong class="dashboard-metric">${progressPercent}%</strong></div><div class="week-list">${weekRows}</div></section>
      <section class="dashboard-card"><div class="dashboard-card-heading"><div><span class="dashboard-kicker">Review queue</span><h2>Concepts to strengthen</h2></div><strong class="dashboard-metric">${concepts.length}</strong></div>${reviewRows}</section>
      <section class="dashboard-card dashboard-card-wide"><div class="dashboard-card-heading"><div><span class="dashboard-kicker">Week ${activeWeek ?? '—'}</span><h2>Material readiness</h2></div><span class="readiness-count">${preparedCount}/${activeSources.length} prepared</span></div>${materialRows}${warnings}${activeChapter ? `<a class="dashboard-text-link" href="${activeChapter.path}">Open Week ${activeWeek} →</a>` : ''}</section>
    </div>
  </section>`
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
  <script>
    try {
      const savedTheme = localStorage.getItem('course-book-theme')
      document.documentElement.dataset.theme = savedTheme === 'light' || savedTheme === 'dark'
        ? savedTheme
        : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {}
  </script>
  <link rel="stylesheet" href="assets/style.css">
  <link rel="stylesheet" href="assets/katex/katex.min.css">
</head>
<body>
  <header><a class="brand" href="./">Course Study Book</a><div class="header-actions"><div class="search-shell"><input id="search" type="search" placeholder="Search notes…" aria-label="Search course notes" aria-controls="results" aria-expanded="false" autocomplete="off"><div id="results" class="search-results" role="listbox" hidden></div></div><button id="theme-toggle" type="button" aria-label="Switch color theme"></button></div></header>
  <div class="layout">
    <aside><a href="guide/">Using this book</a><h2>Weekly chapters</h2>${nav}</aside>
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
    const markdownBody = markdown.render(stripFrontmatter(sourceText))
    const body = page.path === '' ? `${dashboardHtml({ root, chapterFiles })}<section class="dashboard-about">${markdownBody}</section>` : markdownBody
    const outputDir = path.join(destination, page.path)
    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'index.html'), pageTemplate({ title, body, currentPath: page.path, chapterLinks }), 'utf8')
    const slideEntries = slideSearchEntries(stripFrontmatter(sourceText), title, page.path)
    if (slideEntries.length > 0) searchIndex.push(...slideEntries)
    else searchIndex.push({ title, context: 'Course page', path: page.path || './', text: plainText(body).slice(0, 30000) })
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
